/**
 * Очереди BullMQ для автоматизаций
 *
 * Использование:
 * - automationQueue.add('expire-order', { orderId }, { delay, jobId })
 * - automationQueue.remove(jobId)
 */

import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import { MOSCOW_TZ, moscowEndOfDay, moscowToday } from "@/lib/utils/moscow-time";
import { getNextSyncInterval } from "@/lib/avito/human-timing";

// Типы данных для разных job'ов
export interface MoveToTrashJobData {
  orderId: string;
}

// Phase C: новые BullMQ-jobs (BUSINESS_LOGIC.md §14).
export interface ExpireSendByJobData {
  orderId: string;
}

export interface ExpirePickupByJobData {
  orderId: string;
}

export interface AutoResumeProblemJobData {
  productSizeId: string;
}

export interface NotifyVibeFrozenJobData {
  customerId: string;
  /** true — заморозка; false — разморозка. */
  isFrozen: boolean;
}

export interface TrumpetNotifyJobData {
  trumpetSessionId: string;
  customerId: string;
  /** Порядковый номер DM в серии (1..6). */
  sequence: number;
}

export interface ReleaseReservationJobData {
  productSizeId: string;
  sessionId: string;
}

export interface SyncAvitoDataJobData {
  userId?: string; // Optional: sync only one user
}

export interface SyncAvitoTodayStatsJobData {
  userId: string;
  itemIds: number[];
  /** Сессия конкретного Avito-акка — обязательна для мультиаккаунта: today-stats
   *  должны идти через cookies/proxy ЭТОГО акка и писаться в его строки. */
  sessionId?: string;
  accountIndex?: number;
}

export interface AvitoLoginJobData {
  userId: string;
  accountIndex?: number;
}

export interface SyncAvitoOrdersJobData {
  userId?: string;
}

// Avito автопостинг / item actions (Phase 4 — standalone Avito работа).
export interface AvitoItemActionJobData {
  sessionId: string;
  userId: string;
  avitoItemId: string;
  avitoItemUrl: string;
  action: "activate" | "deactivate" | "delete";
}

export interface AvitoPostListingJobData {
  postJobId: string;
  /** Категория Avito для шаблона submit (см. AvitoCategory в web-client). */
  category?: string;
}

// Avito AI-генерация фото (3 категории) с подтверждением в owner-bot.
export interface AvitoGeneratePhotoJobData {
  userId: string;
  productId: string;
  category: "normal" | "photozone" | "personality";
  /** Референс из глобальной библиотеки (фотозона/личность); если не задан — лестница. */
  referencePresetId?: string | null;
  /** Ручной выбор исходных фото из датасета товара (до 3). Пусто = авто (лестница). */
  sourcePresetIds?: string[] | null;
  /** id строки avito_ai_generations при «Переделай» (без списания дневного слота). */
  regenerateOf?: string | null;
  /** Кому слать фото на «Четко/Переделай» (chat_id создателя товара). NULL = владельцу. */
  recipientChatId?: number | null;
}

// Ночная автогенерация AI-обложек: крон проходит по товарам с auto_covers_enabled
// и ставит каждому батч из 5 генераций. Payload не нужен.
export type NightlyCoverGenJobData = Record<string, never>;

// ТЗ Авито-заказы §4.2: мини-AI запрашивает размер у покупателя
// сразу после перехода заказа в awaiting_size.
export interface AvitoRequestSizeJobData {
  orderId: string;
}

// Union тип всех возможных данных
export type AutomationJobData =
  | MoveToTrashJobData
  | ExpireSendByJobData
  | ExpirePickupByJobData
  | AutoResumeProblemJobData
  | NotifyVibeFrozenJobData
  | TrumpetNotifyJobData
  | ReleaseReservationJobData
  | SyncAvitoDataJobData
  | SyncAvitoTodayStatsJobData
  | AvitoLoginJobData
  | SyncAvitoOrdersJobData
  | AvitoItemActionJobData
  | AvitoPostListingJobData
  | AvitoGeneratePhotoJobData
  | AvitoRequestSizeJobData
  | ExpireUnpaidOrderJobData
  | PartnerPaymentExpireJobData
  | PartnerReceiptsDigestJobData
  | DirectorPaymentExpireJobData
  | DirectorReceiptsDigestJobData
  | WithdrawalRequestsDigestJobData;

// AI Sales Agent job data
export interface GenerateSalesDraftJobData {
  userId: string;
  chatId: string;
  messageId: string;
  buyerMessage: string;
  avitoItemId?: number;
}

export interface SendApprovedDraftJobData {
  draftId: string;
  userId: string;
  text: string;
  avitoChatId: string;
}

export interface LearnFromCorrectionsJobData {
  userId?: string;
}

export interface AggregateSalesStatsJobData {
  userId?: string;
  date?: string;
}

// Fraud-detectors cron: без payload, вызов run_fraud_detectors() RPC.
export type RunFraudDetectorsJobData = Record<string, never>;

// Stage 3.5: распознавание чека через OpenAI Vision + создание vibe_payments.
export interface RecognizeReceiptJobData {
  customerId: string;
  orderIds: string[];
  amountExpected: number;
  paymentMethodId: string | null;
  filePath: string; // путь в bucket `receipts`
  expectedSinceIso: string; // ISO-дата: чек должен быть >= этой даты
  route: "owner" | "partner";
  isVibe: boolean;
  partnerId?: string | null;
}

// Экран 4 (б): авто-отмена обычного (не-+ВАЙБ) заказа, если клиент не
// прислал чек оплаты за 10 минут. См. BUSINESS_LOGIC §4.5.
export interface ExpireUnpaidOrderJobData {
  orderId: string;
}

// Экран 4 (г): напоминание партнёру о неподтверждённой оплате (через 6ч
// после форварда чека). Если попадает вне окна работы партнёра —
// откладывается до начала окна.
// Экран 4 (г): auto-cancel заказа через 24ч если партнёр не подтвердил
// оплату текстом «N да» или «N нет». Эскалация в support_telegram_username.
export interface PartnerPaymentExpireJobData {
  orderId: string;
}

// Repeatable: каждые 3ч сводка партнёру со списком его pending'ов где
// чек принят, но партнёр не ответил «N да/нет». Учитывает окно работы.
export type PartnerReceiptsDigestJobData = Record<string, never>;

// Pending передан директору на ручную проверку (Vision не справился).
// Через 24ч → auto-cancel + DM клиенту + эскалация владельцу.
export interface DirectorPaymentExpireJobData {
  pendingOrderId: string;
}

// Repeatable: каждые 6ч сводка директору со списком всех pending'ов где
// чек ждёт его решения. Один digest вместо спама per-pending.
export type DirectorReceiptsDigestJobData = Record<string, never>;

// Repeatable: сводка владельцу со списком всех pending withdrawal_requests.
// Чтобы запросы не зависали в ленте Telegram. Окно/step — общие с
// director_notify_window_* (back-office hours).
export type WithdrawalRequestsDigestJobData = Record<string, never>;

// Названия job'ов
export type AutomationJobName =
  | "move-to-trash"
  | "expire-send-by"
  | "expire-pickup-by"
  | "daily-shipper-cleanup"
  | "auto-resume-problem"
  | "notify-vibe-frozen"
  | "trumpet-notify"
  | "release-reservation"
  | "sync-avito-data"
  | "sync-avito-today-stats"
  | "generate-sales-draft"
  | "send-approved-draft"
  | "learn-from-corrections"
  | "aggregate-sales-stats"
  | "avito-login"
  | "sync-avito-orders"
  | "avito-relogin-check"
  | "proxy-health-check"
  | "update-shipper-scores"
  | "run-fraud-detectors"
  | "recognize-receipt"
  | "expire-unpaid-order"
  | "expire-pending-order"
  | "recognize-pending-receipt"
  | "partner-payment-expire"
  | "partner-receipts-digest"
  | "director-payment-expire"
  | "director-receipts-digest"
  | "withdrawal-requests-digest"
  | "shipper-pool-digest"
  | "expired-orders-morning-digest"
  | "sync-avito-balance"
  | "tracking-polling"
  | "avito-item-action"
  | "avito-post-listing"
  | "avito-generate-photo"
  | "nightly-cover-generation";

// Singleton для очереди
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let automationQueueInstance: Queue | null = null;

/**
 * Получить очередь автоматизаций
 */
export function getAutomationQueue(): Queue {
  if (!automationQueueInstance) {
    automationQueueInstance = new Queue("automation", {
      connection: getRedisConnection(),
      // Изоляция очереди по среде (локалка vs прод на одном Redis). Пусто = дефолт.
      prefix: process.env.BULLMQ_PREFIX || undefined,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60, // Хранить завершённые 24 часа
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60, // Хранить неудачные 7 дней
        },
      },
    });
  }

  return automationQueueInstance;
}

// =============================================================================
// Хелперы для работы с очередью
// =============================================================================

/**
 * Планирование перевода возврата в trash после истечения pickup_by.
 * Phase C перепишет это под BullMQ-job `expire-pickup-by` + `move-to-trash`
 * с точным таймингом по pickup_by вместо delayDays-аппроксимации.
 *
 * @param delayDays — через сколько дней (по умолчанию 14)
 */
export async function scheduleMoveToTrash(
  orderId: string,
  delayDays: number = 14
): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `trash-${orderId}`;
  const delay = delayDays * 24 * 60 * 60 * 1000;

  await queue.add(
    "move-to-trash",
    { orderId },
    {
      delay,
      jobId,
    }
  );

  console.log(`[Jobs] Scheduled move-to-trash for ${orderId} in ${delayDays} days`);

  return jobId;
}

/**
 * Отмена перевода в trash (при заборе возврата)
 */
export async function cancelMoveToTrash(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `trash-${orderId}`;

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed move-to-trash job for ${orderId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove trash job ${jobId}:`, error);
  }
}

/**
 * Планирование освобождения soft-резерва на размере (5 минут TTL).
 *
 * jobId уникален per `(sessionId, productSizeId)` — одна сессия может
 * последовательно зарезервировать разные размеры (отменить и выбрать
 * другой), и каждому резерву нужен свой авто-release. Если ставится
 * повторно для одной и той же пары — Bull вернёт существующий job
 * (idempotent).
 */
export async function scheduleReleaseReservation(
  productSizeId: string,
  sessionId: string
): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `reserve-${sessionId}-${productSizeId}`;
  const delay = 5 * 60 * 1000; // 5 минут

  await queue.add(
    "release-reservation",
    { productSizeId, sessionId },
    {
      delay,
      jobId,
    }
  );

  console.log(
    `[Jobs] Scheduled release-reservation for session ${sessionId} / size ${productSizeId} in 5 min`
  );

  return jobId;
}

/**
 * Отмена освобождения резерва (при подтверждении заказа или отмене wizard'а).
 */
export async function cancelReleaseReservation(
  productSizeId: string,
  sessionId: string
): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `reserve-${sessionId}-${productSizeId}`;

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(
        `[Jobs] Removed reservation job for session ${sessionId} / size ${productSizeId}`
      );
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove reservation job ${jobId}:`, error);
  }
}

/**
 * Планирование синхронизации данных Avito.
 *
 * Антидетект: self-rescheduling с jitter (handler перепланирует следующий
 * запуск). Базовый интервал 15 мин, ночью увеличивается до ~60 мин.
 */
const AVITO_SYNC_BASE_INTERVAL_MS = 15 * 60 * 1000;

export async function scheduleAvitoSync(): Promise<void> {
  const queue = getAutomationQueue();

  // Удалить старые repeatable jobs (мигрируем на self-rescheduling)
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "sync-avito-data") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  const firstDelay = getNextSyncInterval(AVITO_SYNC_BASE_INTERVAL_MS);

  await queue.add(
    "sync-avito-data",
    {},
    {
      jobId: "sync-avito-data-next",
      delay: firstDelay,
    }
  );

  console.log(
    `[Jobs] Scheduled sync-avito-data in ${Math.round(firstDelay / 1000 / 60)} min (jittered)`
  );
}

/**
 * Перепланирует следующий цикл sync-avito-data.
 * Вызывается из handleSyncAvitoData после завершения текущего цикла.
 */
export async function rescheduleAvitoSync(): Promise<void> {
  const queue = getAutomationQueue();

  try {
    const existing = await queue.getJob("sync-avito-data-next");
    if (existing) {
      await existing.remove();
    }
  } catch {
    // Игнорируем
  }

  const nextDelay = getNextSyncInterval(AVITO_SYNC_BASE_INTERVAL_MS);

  await queue.add(
    "sync-avito-data",
    {},
    {
      jobId: "sync-avito-data-next",
      delay: nextDelay,
    }
  );

  console.log(`[Jobs] Rescheduled sync-avito-data in ${Math.round(nextDelay / 1000 / 60)} min`);
}

/**
 * Планирование получения статистики Avito за сегодня.
 * Запускается с задержкой 61с после основной синхронизации
 * (V2 Stats API: rate limit 1 req/min).
 */
export async function scheduleAvitoTodayStats(
  userId: string,
  itemIds: number[],
  sessionId?: string,
  accountIndex?: number
): Promise<string> {
  const queue = getAutomationQueue();

  // jobId включает сессию/акк — иначе sync акка #2 удаляет ещё не выполненный
  // pending-job акка #1 (мультиаккаунт терял today-stats всех кроме последнего).
  const jobId = `avito-today-stats-${userId}-${sessionId ?? accountIndex ?? "1"}`;

  // Удалить предыдущий job ЭТОГО же акка если ещё не выполнен
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // Игнорируем
  }

  await queue.add(
    "sync-avito-today-stats",
    { userId, itemIds, sessionId, accountIndex },
    {
      delay: 61_000, // 61с — V2 rate limit 1 req/min
      jobId,
    }
  );

  console.log(
    `[Jobs] Scheduled sync-avito-today-stats for ${userId}/${sessionId ?? accountIndex ?? "1"} (${itemIds.length} items) in 61s`
  );

  return jobId;
}

// =============================================================================
// AI Sales Agent: хелперы
// =============================================================================

/**
 * Планирование ночного самообучения AI-продажника
 * Каждый день в 03:00 МСК
 */
export async function scheduleSalesLearning(): Promise<void> {
  const queue = getAutomationQueue();

  // Удалить старые repeatable jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "learn-from-corrections") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "learn-from-corrections",
    {},
    {
      jobId: "learn-from-corrections-nightly",
      repeat: {
        pattern: "15 0 * * *", // 00:15 МСК
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled learn-from-corrections daily at 00:15 MSK");
}

/**
 * Планирование ежедневной агрегации статистики AI-продажника
 * Каждый день в 00:05 МСК
 */
export async function scheduleSalesStatsAggregation(): Promise<void> {
  const queue = getAutomationQueue();

  // Удалить старые repeatable jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "aggregate-sales-stats") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "aggregate-sales-stats",
    {},
    {
      jobId: "aggregate-sales-stats-daily",
      repeat: {
        pattern: "5 0 * * *", // 00:05 МСК
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled aggregate-sales-stats daily at 00:05 MSK");
}

/**
 * Планирование отправки одобренного черновика с задержкой
 */
export async function scheduleSendApprovedDraft(
  draftId: string,
  userId: string,
  text: string,
  avitoChatId: string,
  delaySec: number
): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `send-draft-${draftId}`;

  await queue.add(
    "send-approved-draft",
    { draftId, userId, text, avitoChatId },
    {
      delay: delaySec * 1000,
      jobId,
    }
  );

  console.log(`[Jobs] Scheduled send-approved-draft for draft ${draftId} in ${delaySec}s`);

  return jobId;
}

/**
 * ТЗ Авито-заказы §4.2: запрос размера у покупателя Авито через мини-AI.
 * Срабатывает после перехода заказа в awaiting_size (handler sync-avito-orders).
 * jobId = order-id обеспечивает идемпотентность (повторный sync не дублирует).
 */
export async function scheduleAvitoRequestSize(orderId: string): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `avito-request-size-${orderId}`;
  await queue.add("avito-request-size", { orderId }, { jobId });
  console.log(`[Jobs] Scheduled avito-request-size for order ${orderId}`);
  return jobId;
}

/**
 * ТЗ Авито-заказы §4.4: периодическая обработка awaiting_size заказов
 * (парсинг входящих ответов, таймаут, эскалация). Self-rescheduling
 * каждые 2 минуты — компромисс между отзывчивостью AI и нагрузкой на API.
 */
const AVITO_PROCESS_AWAITING_SIZE_INTERVAL_MS = 2 * 60 * 1000;

export async function scheduleAvitoProcessAwaitingSize(): Promise<void> {
  const queue = getAutomationQueue();
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "avito-process-awaiting-size") {
      await queue.removeRepeatableByKey(job.key);
    }
  }
  await queue.add(
    "avito-process-awaiting-size",
    {},
    {
      jobId: "avito-process-awaiting-size-repeat",
      repeat: { every: AVITO_PROCESS_AWAITING_SIZE_INTERVAL_MS },
    }
  );
  console.log("[Jobs] Scheduled avito-process-awaiting-size (every 2m)");
}

// =============================================================================
// Avito browser sessions: хелперы
// =============================================================================

/**
 * Планирование одноразового входа в Avito через Puppeteer.
 * Запускается при подключении аккаунта клиентом.
 */
export async function scheduleAvitoLogin(userId: string, accountIndex: number = 1): Promise<void> {
  const queue = getAutomationQueue();

  const jobId = `avito-login-${userId}-${accountIndex}`;

  // Удалить предыдущий pending job если есть
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // Игнорируем
  }

  // attempts:1 — обработка через ротацию прокси внутри handler.
  // BullMQ-retries сжигают прокси х3 на каждом провале и без пользы.
  await queue.add("avito-login", { userId, accountIndex }, { jobId, attempts: 1 });

  console.log(`[Jobs] Scheduled avito-login for userId: ${userId}`);
}

/**
 * Планирование синхронизации заказов Avito.
 *
 * Антидетект: self-rescheduling с jitter (как scheduleAvitoSync).
 * Web API более чувствительный — базовый интервал 20 мин, ночью до 80 мин.
 */
const AVITO_ORDERS_SYNC_BASE_INTERVAL_MS = 20 * 60 * 1000;

export async function scheduleAvitoOrdersSync(): Promise<void> {
  const queue = getAutomationQueue();

  // Удалить старые repeatable jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "sync-avito-orders") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  const firstDelay = getNextSyncInterval(AVITO_ORDERS_SYNC_BASE_INTERVAL_MS);

  await queue.add(
    "sync-avito-orders",
    {},
    {
      jobId: "sync-avito-orders-next",
      delay: firstDelay,
    }
  );

  console.log(
    `[Jobs] Scheduled sync-avito-orders in ${Math.round(firstDelay / 1000 / 60)} min (jittered)`
  );
}

/**
 * Перепланирует следующий цикл sync-avito-orders.
 * Вызывается из handleSyncAvitoOrders после завершения.
 */
export async function rescheduleAvitoOrdersSync(): Promise<void> {
  const queue = getAutomationQueue();

  try {
    const existing = await queue.getJob("sync-avito-orders-next");
    if (existing) {
      await existing.remove();
    }
  } catch {
    // Игнорируем
  }

  const nextDelay = getNextSyncInterval(AVITO_ORDERS_SYNC_BASE_INTERVAL_MS);

  await queue.add(
    "sync-avito-orders",
    {},
    {
      jobId: "sync-avito-orders-next",
      delay: nextDelay,
    }
  );

  console.log(`[Jobs] Rescheduled sync-avito-orders in ${Math.round(nextDelay / 1000 / 60)} min`);
}

/**
 * Periodic sweep — safety net для таймерных переходов.
 *
 * Каждый таймер (бронь размера 5 мин, неоплаченный заказ 10 мин и т.п.)
 * имеет свой BullMQ delayed job — это primary trigger с точным срабатыванием.
 * Этот sweep запускается каждую минуту и подбирает всё что delayed job
 * почему-то пропустил (потеря Redis-job, рестарт worker'а, race condition).
 *
 * Условия фильтрации в самом sweep'е идут по реальным БД-полям
 * (`expires_at`, `created_at`) — это источник правды.
 */
export async function scheduleSweep(): Promise<void> {
  const queue = getAutomationQueue();

  // Удалить старые repeatable jobs (в т.ч. предыдущие версии расписания).
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "sweep-expired") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "sweep-expired",
    {},
    {
      repeat: {
        every: 60 * 1000, // каждую минуту
      },
    }
  );

  console.log("[Jobs] Scheduled sweep-expired every minute");
}

/**
 * Daily sweep send_by — раз в сутки в 00:03 МСК. Заказы у которых
 * send_by < сегодня и статус ещё активный → cancelled через
 * expireSendByCore. Не имеет смысла прогонять чаще, потому что send_by —
 * это суточная единица (срок «до конца дня»).
 */
export async function scheduleSendBySweepDaily(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "sweep-send-by-daily") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "sweep-send-by-daily",
    {},
    {
      jobId: "sweep-send-by-daily",
      repeat: {
        pattern: "3 0 * * *", // 00:03 МСК
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled sweep-send-by-daily at 00:03 MSK");
}

/**
 * Daily sweep pickup_by — раз в сутки в 00:03 МСК (симметрично
 * sweep-send-by-daily). Возвраты у которых pickup_by < сегодня и
 * статус ещё `return` → trash через handleMoveToTrash (с адаптивной
 * шкалой вины §6.6). С 2026-05-26 заменяет per-order
 * scheduleExpirePickupBy — единый механизм для send_by и pickup_by.
 */
export async function schedulePickupBySweepDaily(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "sweep-pickup-by-daily") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "sweep-pickup-by-daily",
    {},
    {
      jobId: "sweep-pickup-by-daily",
      repeat: {
        pattern: "3 0 * * *", // 00:03 МСК — тот же таймер что sweep-send-by-daily
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled sweep-pickup-by-daily at 00:03 MSK");
}

/**
 * Ежедневный прогон fraud-детекторов клиентов в 00:30 МСК — после того как
 * предыдущие nightly-jobs (cleanup, sweep, scores) отработали.
 */
export async function scheduleFraudDetectorsDaily(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "run-fraud-detectors") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "run-fraud-detectors",
    {},
    {
      jobId: "run-fraud-detectors-daily",
      repeat: {
        pattern: "30 0 * * *", // 00:30 МСК
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled run-fraud-detectors daily at 00:30 MSK");
}

/**
 * Ежедневное обновление ELO-score отправщиков в 00:10 МСК.
 * Считает эффективность за вчера и обновляет score.
 */
export async function scheduleShipperScoreUpdate(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "update-shipper-scores") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "update-shipper-scores",
    {},
    {
      jobId: "update-shipper-scores-daily",
      repeat: {
        pattern: "10 0 * * *", // 00:10 МСК
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled update-shipper-scores daily at 00:10 MSK");
}

// =============================================================================
// Phase C: новые BullMQ-jobs под BUSINESS_LOGIC.md §14
// =============================================================================

// Отмена просрочки заказа — только через ежедневный sweepStuckSendByDaily
// в 00:03 МСК (см. sweep-expired-orders.ts). Per-order BullMQ-будильник
// `scheduleExpireSendBy` удалён 2026-05-26 как ненужная сложность.
// `cancelExpireSendBy` ниже оставлен как safe-noop на случай orphan jobs
// в Redis после миграции.
export async function cancelExpireSendBy(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `expire-send-by-${orderId}`;
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed expire-send-by job for ${orderId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove ${jobId}:`, error);
  }
}

// Отмена просрочки возврата — только через ежедневный sweepStuckPickupByDaily
// в 00:03 МСК (см. sweep-expired-orders.ts). Per-order BullMQ-будильник
// `scheduleExpirePickupBy` удалён 2026-05-26 — симметрично send_by.
// `cancelExpirePickupBy` ниже оставлен как safe-noop на случай orphan jobs
// в Redis после миграции.
export async function cancelExpirePickupBy(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `expire-pickup-by-${orderId}`;
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed expire-pickup-by job for ${orderId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove ${jobId}:`, error);
  }
}

/**
 * Cron 00:00 МСК: откат залипших collecting/printed → paid (BUSINESS_LOGIC §4.6).
 * Регистрируется одноразово при старте worker'а (см. scripts/worker.ts).
 */
export async function scheduleDailyShipperCleanup(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "daily-shipper-cleanup") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "daily-shipper-cleanup",
    {},
    {
      jobId: "daily-shipper-cleanup-cron",
      repeat: {
        pattern: "0 0 * * *", // 00:00 МСК
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled daily-shipper-cleanup daily at 00:00 MSK");
}

/**
 * Запланировать восстановление problem-заказов на конкретный SKU+размер.
 * Вызывается из мест где остаток мог стать > 0 (return_done, ручное пополнение).
 *
 * `resumedFromReturnOrderId` — id возврата, который освободил остаток.
 * Если передан, handler пишет в system_comment подсказку «взять с возврата №N».
 */
export async function scheduleAutoResumeProblem(
  productSizeId: string,
  resumedFromReturnOrderId?: string | null
): Promise<string> {
  const queue = getAutomationQueue();

  // Дедупликация: один pending job на product_size_id.
  const jobId = `auto-resume-${productSizeId}`;
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "delayed" || state === "waiting" || state === "active") {
        console.log(`[Jobs] auto-resume-problem already pending for ${productSizeId}`);
        return jobId;
      }
      await existing.remove();
    }
  } catch {
    // ignore
  }

  await queue.add(
    "auto-resume-problem",
    { productSizeId, resumedFromReturnOrderId: resumedFromReturnOrderId ?? null },
    { jobId }
  );

  console.log(`[Jobs] Scheduled auto-resume-problem for size ${productSizeId}`);
  return jobId;
}

/**
 * Поставить notify-vibe-frozen / notify-vibe-unfrozen — DM клиенту
 * после того как триггер БД переключил customers.is_frozen.
 *
 * Идемпотентность: jobId включает is_frozen — пара заморозка/разморозка
 * не схлопнется в одно сообщение.
 */
export async function scheduleNotifyVibeFrozen(
  customerId: string,
  isFrozen: boolean
): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `notify-vibe-${isFrozen ? "frozen" : "unfrozen"}-${customerId}-${Date.now()}`;

  await queue.add(
    "notify-vibe-frozen",
    { customerId, isFrozen },
    {
      jobId,
      // Небольшая задержка — даём БД-триггеру дописать customer_vibe_debt.
      delay: 1000,
    }
  );

  console.log(`[Jobs] Scheduled notify-vibe-${isFrozen ? "frozen" : "unfrozen"} for ${customerId}`);
  return jobId;
}

/**
 * Серия trumpet-notify DM для одного клиента (BUSINESS_LOGIC §6.4 + memory
 * trumpet_notify_design.md). Расписание относительно момента нажатия:
 *   #1 сразу, #2 +30мин, #3 +1ч, #4 +2ч, #5 +5ч, #6 +8ч.
 * Дальше — за окном 21:00 МСК → at-runtime скип в handler.
 *
 * jobId формат: `trumpet-<sessionId>-<customerId>-<sequence>` для возможности
 * массовой отмены (cancelTrumpetSeries).
 */
export async function scheduleTrumpetNotifications(
  trumpetSessionId: string,
  customerId: string
): Promise<string[]> {
  const queue = getAutomationQueue();
  const delaysMin = [0, 30, 60, 120, 300, 480];

  const jobIds: string[] = [];
  for (let i = 0; i < delaysMin.length; i++) {
    const sequence = i + 1;
    const jobId = `trumpet-${trumpetSessionId}-${customerId}-${sequence}`;
    await queue.add(
      "trumpet-notify",
      { trumpetSessionId, customerId, sequence },
      {
        jobId,
        delay: delaysMin[i] * 60 * 1000,
      }
    );
    jobIds.push(jobId);
  }

  console.log(
    `[Jobs] Scheduled trumpet-notify series (${delaysMin.length} jobs) for customer ${customerId}, session ${trumpetSessionId}`
  );
  return jobIds;
}

/**
 * Отмена всей серии trumpet-notify для клиента в конкретной сессии.
 * Используется при «Отменить trumpet» из shipper-PWA.
 */
export async function cancelTrumpetNotifications(
  trumpetSessionId: string,
  customerId: string
): Promise<void> {
  const queue = getAutomationQueue();
  for (let sequence = 1; sequence <= 6; sequence++) {
    const jobId = `trumpet-${trumpetSessionId}-${customerId}-${sequence}`;
    try {
      const job = await queue.getJob(jobId);
      if (job) await job.remove();
    } catch (e) {
      console.warn(`[Jobs] could not cancel ${jobId}:`, e);
    }
  }
}

/**
 * Запланировать авто-отмену неоплаченного заказа через `delayMinutes` минут.
 * Используется в wizard'е оформления заказа для обычных (не-+ВАЙБ) клиентов.
 * Если за это время клиент не пришлёт чек — заказ переходит в `cancelled`,
 * сток освобождается. См. handler `expire-unpaid-order`.
 */
export async function scheduleExpireUnpaidOrder(
  orderId: string,
  delayMinutes: number = 10
): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `expire-unpaid-${orderId}`;
  const delay = delayMinutes * 60 * 1000;

  await queue.add(
    "expire-unpaid-order",
    { orderId },
    {
      delay,
      jobId,
    }
  );

  console.log(`[Jobs] Scheduled expire-unpaid-order for ${orderId} in ${delayMinutes} min`);
  return jobId;
}

/** Отмена expire-unpaid-order job (клиент прислал чек / отменил заказ). */
export async function cancelExpireUnpaidOrder(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `expire-unpaid-${orderId}`;
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed expire-unpaid-order job for ${orderId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove ${jobId}:`, error);
  }
}

export interface ExpirePendingOrderJobData {
  pendingOrderId: string;
}

export interface RecognizePendingReceiptJobData {
  pendingOrderId: string;
  filePath: string;
  expectedAmount: number;
  expectedSinceIso: string;
}

/**
 * Запускает Vision auto-confirm на чеке pending_orders записи.
 * См. handler `recognize-pending-receipt`. Только не-партнёрские pending'и
 * (для партнёрских — текстовое «N да/нет» без Vision).
 */
export async function scheduleRecognizePendingReceipt(
  data: RecognizePendingReceiptJobData
): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `recognize-pending-${data.pendingOrderId}-${Date.now()}`;

  await queue.add("recognize-pending-receipt", data, { jobId });

  console.log(`[Jobs] Queued recognize-pending-receipt for ${data.pendingOrderId}`);
  return jobId;
}

/**
 * Авто-отмена pending_orders записи через `delayMinutes` минут (10 по дефолту).
 * Используется для не-+ВАЙБ клиентов: после wizard-confirm pending_order живёт
 * до прихода чека или до истечения TTL — в обоих случаях запись должна
 * корректно сняться с decrement reserved_quantity.
 */
export async function scheduleExpirePendingOrder(
  pendingOrderId: string,
  delayMinutes: number = 10
): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `expire-pending-${pendingOrderId}`;
  const delay = delayMinutes * 60 * 1000;

  await queue.add("expire-pending-order", { pendingOrderId }, { delay, jobId });

  console.log(`[Jobs] Scheduled expire-pending-order for ${pendingOrderId} in ${delayMinutes} min`);
  return jobId;
}

/** Отмена expire-pending-order job (клиент прислал чек / partner подтвердил / отменил). */
export async function cancelExpirePendingOrder(pendingOrderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `expire-pending-${pendingOrderId}`;
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed expire-pending-order job for ${pendingOrderId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove ${jobId}:`, error);
  }
}

/**
 * 24-часовой expire для партнёрского pending'а. Если партнёр не ответил
 * «N да/нет» за сутки — auto-cancel + эскалация. Напоминания идут отдельным
 * digest-job'ом каждые 3ч сразу по всем pending'ам данного партнёра.
 */
export async function schedulePartnerPaymentTimers(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const expireId = `partner-payment-expire-${orderId}`;

  await queue.add(
    "partner-payment-expire",
    { orderId },
    {
      delay: 24 * 60 * 60 * 1000,
      jobId: expireId,
    }
  );

  console.log(`[Jobs] Scheduled partner-payment-expire for ${orderId} (+24h)`);
}

/** Отмена 24-часового expire партнёрского заказа (ответил или снят). */
export async function cancelPartnerPaymentTimers(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const expireId = `partner-payment-expire-${orderId}`;

  try {
    const job = await queue.getJob(expireId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed ${expireId}`);
    }
  } catch (e) {
    console.warn(`[Jobs] Could not remove ${expireId}:`, e);
  }
}

/** Repeatable: каждые 3 часа сводка партнёрам с их pending'ами. */
export async function schedulePartnerReceiptsDigest(): Promise<void> {
  const queue = getAutomationQueue();

  // Чистим ВСЕ старые repeatables с этим name (включая зомби от прошлых
  // версий с every-расписанием — у них разные key но одинаковый name).
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "partner-receipts-digest") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Cron-pattern с tz даёт детерминированный jobKey: повторный add будет no-op,
  // дубликаты не плодятся даже при многократных рестартах worker'а.
  // Срабатывает 5 раз в день в окне 10:00–22:00 МСК.
  // Стреляем КАЖДЫЙ ЧАС в МСК; handler сам решит «сейчас отправлять или
  // skip» — читает текущие partner_notify_window_* и partner_digest_step_hours
  // из business_settings. Так смена расписания через UI применяется на
  // следующем же часовом тике без перепланирования.
  await queue.add(
    "partner-receipts-digest",
    {},
    {
      repeat: {
        pattern: "0 * * * *",
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled partner-receipts-digest hourly (handler decides)");
}

/**
 * 24-часовой expire для pending'а который ушёл к директору на ручную проверку.
 * Если за сутки решения нет — pending авто-отменяется, клиенту DM, владельцу
 * эскалация.
 *
 * Пока работает этот таймер, 10-минутный `expire-pending-order` уже не
 * сработает (он проверяет `pending.receipt_received_at` и игнорирует
 * pending'и с уже принятым чеком).
 *
 * Напоминания директору идут отдельным digest-job'ом каждые 6 часов
 * сразу по всем pending'ам — см. `scheduleDirectorReceiptsDigest`.
 */
export async function scheduleDirectorPaymentExpire(pendingOrderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const expireId = `director-payment-expire-${pendingOrderId}`;

  await queue.add(
    "director-payment-expire",
    { pendingOrderId },
    { delay: 24 * 60 * 60 * 1000, jobId: expireId }
  );

  console.log(`[Jobs] Scheduled director-payment-expire for ${pendingOrderId} (+24h)`);
}

/** Отмена 24-часового expire (директор ответил «N да/нет» или pending снят). */
export async function cancelDirectorPaymentExpire(pendingOrderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const expireId = `director-payment-expire-${pendingOrderId}`;
  try {
    const job = await queue.getJob(expireId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed ${expireId}`);
    }
  } catch (e) {
    console.warn(`[Jobs] Could not remove ${expireId}:`, e);
  }
}

/**
 * Repeatable: ежечасный тик. Handler сам читает `director_notify_window_*` +
 * `director_digest_step_hours` из `business_settings` и решает на каждом
 * часовом тике — отправлять или нет. Смена расписания через UI применяется
 * на следующем же тике без перепланирования и рестартов.
 *
 * Cron-pattern с `tz` даёт детерминированный jobKey: повторный add — no-op,
 * дубликаты не плодятся даже при многократных рестартах worker'а.
 */
export async function scheduleDirectorReceiptsDigest(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "director-receipts-digest") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "director-receipts-digest",
    {},
    {
      repeat: {
        pattern: "0 * * * *",
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled director-receipts-digest hourly (handler decides)");
}

/**
 * Repeatable: ежечасный тик. Handler сам читает `director_notify_window_*` +
 * `director_digest_step_hours` (reuse — back-office hours) и решает на каждом
 * часовом тике, отправлять ли сводку pending withdrawal_requests владельцу.
 *
 * Если pending'ов нет — handler сразу выходит, DM не отправляется.
 */
export async function scheduleWithdrawalRequestsDigest(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "withdrawal-requests-digest") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "withdrawal-requests-digest",
    {},
    {
      repeat: {
        pattern: "0 * * * *",
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled withdrawal-requests-digest hourly (handler decides)");
}

/**
 * Repeatable: тик каждые 30 мин. Handler сам читает
 * `business_settings.send_by_today_cutoff` и `last_shipper_pool_digest_date`,
 * шлёт DM-дайджест отправщикам один раз в день — после прохождения cutoff'а.
 *
 * Если сегодня уже отправляли или cutoff ещё не прошёл — handler сразу выходит.
 */
export async function scheduleShipperPoolDigest(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "shipper-pool-digest") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "shipper-pool-digest",
    {},
    {
      repeat: {
        pattern: "*/30 * * * *",
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled shipper-pool-digest every 30 min (handler decides)");
}

/**
 * Repeatable: 10:00 МСК ежедневно. Handler сам считает количество
 * заказов с `cancel_reason='send_by_expired'` за вчерашние сутки и шлёт
 * DM владельцу — со списком отправщиков, которые должны были работать
 * вчера по `work_days`. Если вчера ничего не сгорело — handler выходит,
 * DM не отправляется.
 */
export async function scheduleExpiredOrdersMorningDigest(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "expired-orders-morning-digest") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "expired-orders-morning-digest",
    {},
    {
      repeat: {
        pattern: "0 10 * * *",
        tz: MOSCOW_TZ,
      },
    }
  );

  console.log("[Jobs] Scheduled expired-orders-morning-digest at 10:00 MSK");
}

// =============================================================================
// Avito re-login check: периодическая проверка expired сессий
// =============================================================================

/**
 * Планирование периодической проверки expired сессий.
 * Каждые 10 минут проверяет expired и планирует re-login.
 */
export async function scheduleAvitoReloginCheck(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "avito-relogin-check") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // AVITO_DISABLE_RELOGIN=1 — отключает периодический relogin-check.
  // Полезно когда datacenter-IPv4 прокси выгорают (каждые 10 мин jobs
  // сжигают доверие IP и блокируют SMS rate-limit на номере).
  if (process.env.AVITO_DISABLE_RELOGIN === "1") {
    console.log("[Jobs] avito-relogin-check DISABLED via AVITO_DISABLE_RELOGIN=1");
    return;
  }

  await queue.add(
    "avito-relogin-check",
    {},
    {
      jobId: "avito-relogin-check-periodic",
      repeat: {
        every: 10 * 60 * 1000,
      },
    }
  );

  console.log("[Jobs] Scheduled avito-relogin-check every 10 min");
}

// =============================================================================
// Proxy health check: проверка живости прокси
// =============================================================================

/**
 * Планирование периодической проверки здоровья прокси.
 * Каждые 30 минут пингает все активные прокси.
 */
export async function scheduleProxyHealthCheck(): Promise<void> {
  const queue = getAutomationQueue();

  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "proxy-health-check") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await queue.add(
    "proxy-health-check",
    {},
    {
      jobId: "proxy-health-check-periodic",
      repeat: {
        every: 10 * 60 * 1000,
      },
    }
  );

  console.log("[Jobs] Scheduled proxy-health-check (+failover) every 10 min");
}

// =============================================================================
// Tracking polling — отслеживание доставки Avito-заказов (Track.global)
// =============================================================================
export async function scheduleTrackingPolling(): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = "tracking-polling-hourly";
  try {
    const existing = await queue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    // ignore
  }
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "tracking-polling") {
      await queue.removeRepeatableByKey(job.key);
    }
  }
  await queue.add(
    "tracking-polling",
    {},
    {
      jobId,
      repeat: { every: 60 * 60 * 1000 }, // каждый час
    }
  );
  console.log("[Jobs] Scheduled tracking-polling every hour");
}

// =============================================================================
// Avito balance sync — баланс/аванс/рейтинг каждые 4ч
// =============================================================================
export async function scheduleAvitoBalanceSync(): Promise<void> {
  const queue = getAutomationQueue();
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "sync-avito-balance") {
      await queue.removeRepeatableByKey(job.key);
    }
  }
  await queue.add(
    "sync-avito-balance",
    {},
    {
      jobId: "sync-avito-balance-periodic",
      repeat: { every: 4 * 60 * 60 * 1000 },
    }
  );
  console.log("[Jobs] Scheduled sync-avito-balance every 4h");
}

// =============================================================================
// Avito item-actions (вкл/выкл/удалить объявление через браузер)
// =============================================================================
export async function scheduleAvitoItemAction(
  data: AvitoItemActionJobData
): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `item-action-${data.sessionId}-${data.avitoItemId}-${Date.now()}`;
  await queue.add("avito-item-action", data, { jobId });
  console.log(
    `[Jobs] Scheduled avito-item-action ${data.action} for item ${data.avitoItemId}`
  );
  return jobId;
}

// =============================================================================
// Avito post-listing (автопостинг через браузер, Phase 4)
// =============================================================================
export async function scheduleAvitoPostListing(
  postJobId: string,
  category?: string
): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `post-listing-${postJobId}`;
  await queue.add(
    "avito-post-listing",
    { postJobId, category } as AvitoPostListingJobData,
    { jobId }
  );
  console.log(`[Jobs] Scheduled avito-post-listing for ${postJobId}`);
  return jobId;
}

// =============================================================================
// Avito AI-генерация фото (3 категории, подтверждение в owner-bot)
// =============================================================================
export async function scheduleAvitoGeneratePhoto(
  data: AvitoGeneratePhotoJobData
): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `gen-photo-${data.productId}-${data.category}-${Date.now()}`;
  // attempts:1 — генерация дорогая (Gemini), ретраи не нужны.
  await queue.add("avito-generate-photo", data, { jobId, attempts: 1 });
  console.log(
    `[Jobs] Scheduled avito-generate-photo (${data.category}) for product ${data.productId}`
  );
  return jobId;
}

/**
 * Батч из 5 генераций для одного товара (2 normal + 2 photozone + 1 personality).
 * Дневной cap (claim_ai_gen_slot, 2/2/1) внутри хендлера гарантирует «1 батч/сутки/товар»:
 * если сегодня уже генерили — лишние просто пропустятся. Используется ночным кроном и
 * ручной кнопкой «Сгенерить сейчас». recipientChatId — кому слать на «Четко/Переделай».
 */
export async function enqueueProductCoverBatch(
  userId: string,
  productId: string,
  recipientChatId: number | null
): Promise<void> {
  const queue = getAutomationQueue();
  const cats: AvitoGeneratePhotoJobData["category"][] = [
    "normal",
    "normal",
    "photozone",
    "photozone",
    "personality",
  ];
  const ts = Date.now();
  for (let i = 0; i < cats.length; i++) {
    const data: AvitoGeneratePhotoJobData = {
      userId,
      productId,
      category: cats[i],
      recipientChatId: recipientChatId ?? null,
    };
    await queue.add("avito-generate-photo", data, {
      jobId: `gen-photo-${productId}-${cats[i]}-${ts}-${i}`,
      attempts: 1,
      // Сдвиг старта ~3с между джобами. Дневной слот (claim_ai_gen_slot) при ОДНОВРЕМЕННОМ
      // старте всех 5 джоб ловит конкуренцию на счётчике-капе (приходило 3 из 5 вместо 5 —
      // 2 джобы «висели» на claim и отбивались как «daily limit reached»). Сдвиг сериализует
      // claim → корректные 2 normal + 2 photozone + 1 personality.
      delay: i * 3000,
    });
  }
  console.log(`[Jobs] Enqueued cover batch (5) for product ${productId}`);
}

/** Ночная автогенерация AI-обложек — repeatable 03:00 МСК. */
export async function scheduleNightlyCoverGeneration(): Promise<void> {
  const queue = getAutomationQueue();
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "nightly-cover-generation") await queue.removeRepeatableByKey(job.key);
  }
  await queue.add(
    "nightly-cover-generation",
    {},
    { jobId: "nightly-cover-generation-daily", repeat: { pattern: "0 3 * * *", tz: MOSCOW_TZ } }
  );
  console.log("[Jobs] Scheduled nightly-cover-generation at 03:00 MSK");
}

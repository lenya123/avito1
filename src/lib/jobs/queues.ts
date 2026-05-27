/**
 * Очереди BullMQ для автоматизаций
 *
 * Использование:
 * - automationQueue.add('expire-order', { orderId }, { delay, jobId })
 * - automationQueue.remove(jobId)
 */

import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import { getNextSyncInterval } from "@/lib/avito/human-timing";

// Типы данных для разных job'ов
export interface ExpireOrderJobData {
  orderId: string;
}

export interface DeadlineReminderJobData {
  orderId: string;
}

export interface MoveToTrashJobData {
  orderId: string;
}

export interface ReturnArrivedJobData {
  orderId: string;
}

export interface DisposeTrashJobData {
  orderId: string;
}

export interface ReleaseReservationJobData {
  productSizeId: string;
  sessionId: string;
}

export interface DeactivateReferralJobData {
  bonusId: string;
}

export interface SyncAvitoDataJobData {
  userId?: string; // Optional: sync only one user
}

export interface SyncAvitoTodayStatsJobData {
  userId: string;
  itemIds: number[];
}

export interface AvitoLoginJobData {
  userId: string;
  accountIndex?: number;
}

export interface SyncAvitoOrdersJobData {
  userId?: string;
}

// Union тип всех возможных данных
export type AutomationJobData =
  | ExpireOrderJobData
  | DeadlineReminderJobData
  | MoveToTrashJobData
  | ReturnArrivedJobData
  | DisposeTrashJobData
  | ReleaseReservationJobData
  | DeactivateReferralJobData
  | SyncAvitoDataJobData
  | SyncAvitoTodayStatsJobData
  | AvitoLoginJobData
  | SyncAvitoOrdersJobData;

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

// Названия job'ов
export type AutomationJobName =
  | "expire-order"
  | "deadline-reminder"
  | "deadline-reminder-same-day"
  | "move-to-trash"
  | "return-arrived"
  | "dispose-trash"
  | "release-reservation"
  | "deactivate-referral"
  | "tracking-polling"
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
  | "avito-item-action"
  | "avito-post-listing"
  | "sync-avito-balance";

export interface AvitoItemActionJobData {
  sessionId: string;
  userId: string;
  avitoItemId: string;
  avitoItemUrl: string;
  action: "activate" | "deactivate" | "delete";
}

export interface AvitoPostListingJobData {
  postJobId: string;
}

// Singleton для очереди
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let automationQueueInstance: Queue | null = null;

/**
 * Получить очередь автоматизаций
 */
// Изолируем нашу очередь от шаринг-Redis с основным проектом
export const BULL_PREFIX = process.env.BULLMQ_PREFIX || "bull-avito-standalone";

export function getAutomationQueue(): Queue {
  if (!automationQueueInstance) {
    automationQueueInstance = new Queue("automation", {
      prefix: BULL_PREFIX,
      connection: getRedisConnection(),
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
 * Планирование автоотмены заказа по дедлайну
 * Выполнится в конце дня дедлайна (23:59:59)
 */
export async function scheduleOrderExpiration(
  orderId: string,
  deliveryDeadline: Date
): Promise<string | undefined> {
  const queue = getAutomationQueue();

  // Устанавливаем время на конец дня дедлайна (23:59 по Москве)
  const deadlineDate = new Date(deliveryDeadline);
  const moscowDateStr = deadlineDate.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
  const expireAt = new Date(`${moscowDateStr}T23:59:59.999+03:00`);

  const delay = expireAt.getTime() - Date.now();

  // Если дедлайн уже прошёл — не планируем
  if (delay <= 0) {
    console.warn(`[Jobs] Order ${orderId} deadline already passed, skipping expiration job`);
    return undefined;
  }

  const jobId = `expire-${orderId}`;

  await queue.add(
    "expire-order",
    { orderId },
    {
      delay,
      jobId,
    }
  );

  console.log(
    `[Jobs] Scheduled expire-order for ${orderId} at ${expireAt.toISOString()} (delay: ${Math.round(delay / 1000 / 60)} min)`
  );

  return jobId;
}

/**
 * Планирование напоминаний о дедлайне
 * - За 1 день до дедлайна в 15:00
 * - В день дедлайна в 13:00
 */
export async function scheduleDeadlineReminder(
  orderId: string,
  deliveryDeadline: Date
): Promise<{ dayBefore?: string; sameDay?: string }> {
  const queue = getAutomationQueue();
  const result: { dayBefore?: string; sameDay?: string } = {};

  // 1. За 1 день до дедлайна в 15:00
  const dayBeforeDate = new Date(deliveryDeadline);
  dayBeforeDate.setDate(dayBeforeDate.getDate() - 1);
  dayBeforeDate.setHours(15, 0, 0, 0);

  const dayBeforeDelay = dayBeforeDate.getTime() - Date.now();

  if (dayBeforeDelay > 0) {
    const jobId = `reminder-${orderId}`;

    await queue.add(
      "deadline-reminder",
      { orderId },
      {
        delay: dayBeforeDelay,
        jobId,
      }
    );

    console.log(
      `[Jobs] Scheduled deadline-reminder for ${orderId} at ${dayBeforeDate.toISOString()} (15:00 day before)`
    );

    result.dayBefore = jobId;
  }

  // 2. В день дедлайна в 13:00
  const sameDayDate = new Date(deliveryDeadline);
  sameDayDate.setHours(13, 0, 0, 0);

  const sameDayDelay = sameDayDate.getTime() - Date.now();

  if (sameDayDelay > 0) {
    const jobId = `reminder-same-day-${orderId}`;

    await queue.add(
      "deadline-reminder-same-day",
      { orderId },
      {
        delay: sameDayDelay,
        jobId,
      }
    );

    console.log(
      `[Jobs] Scheduled deadline-reminder-same-day for ${orderId} at ${sameDayDate.toISOString()} (13:00 same day)`
    );

    result.sameDay = jobId;
  }

  return result;
}

/**
 * Отмена job'ов при отправке заказа
 */
export async function cancelOrderJobs(orderId: string): Promise<void> {
  const queue = getAutomationQueue();

  const jobIds = [`expire-${orderId}`, `reminder-${orderId}`, `reminder-same-day-${orderId}`];

  for (const jobId of jobIds) {
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`[Jobs] Removed job ${jobId}`);
      }
    } catch (error) {
      // Job мог уже выполниться или быть удалён
      console.warn(`[Jobs] Could not remove job ${jobId}:`, error);
    }
  }
}

/**
 * Планирование перевода в trash после return_arrived.
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
 * Планирование перехода в return_arrived по ожидаемой дате
 */
export async function scheduleReturnArrived(
  orderId: string,
  expectedReturnDate: Date
): Promise<string | undefined> {
  const queue = getAutomationQueue();

  // Устанавливаем время на начало дня ожидаемой даты (00:01)
  const arrivalDate = new Date(expectedReturnDate);
  arrivalDate.setHours(0, 1, 0, 0);

  const delay = arrivalDate.getTime() - Date.now();

  // Если дата уже прошла — не планируем
  if (delay <= 0) {
    console.warn(`[Jobs] Return date for order ${orderId} already passed, skipping`);
    return undefined;
  }

  const jobId = `return-arrived-${orderId}`;

  await queue.add(
    "return-arrived",
    { orderId },
    {
      delay,
      jobId,
    }
  );

  console.log(`[Jobs] Scheduled return-arrived for ${orderId} at ${arrivalDate.toISOString()}`);

  return jobId;
}

/**
 * Отмена перехода в return_arrived (если отменили возврат)
 */
export async function cancelReturnArrived(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `return-arrived-${orderId}`;

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed return-arrived job for ${orderId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove return-arrived job ${jobId}:`, error);
  }
}

/**
 * Планирование аннулирования (30 дней после trash)
 */
export async function scheduleDisposeTrash(orderId: string): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `dispose-${orderId}`;
  const delay = 30 * 24 * 60 * 60 * 1000; // 30 дней

  await queue.add(
    "dispose-trash",
    { orderId },
    {
      delay,
      jobId,
    }
  );

  console.log(`[Jobs] Scheduled dispose-trash for ${orderId} in 30 days`);

  return jobId;
}

/**
 * Отмена аннулирования (при восстановлении из trash)
 */
export async function cancelDisposeTrash(orderId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `dispose-${orderId}`;

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed dispose-trash job for ${orderId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove dispose job ${jobId}:`, error);
  }
}

/**
 * Планирование освобождения резерва (10 минут)
 */
export async function scheduleReleaseReservation(
  productSizeId: string,
  sessionId: string
): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `reserve-${sessionId}`;
  const delay = 10 * 60 * 1000; // 10 минут

  await queue.add(
    "release-reservation",
    { productSizeId, sessionId },
    {
      delay,
      jobId,
    }
  );

  console.log(`[Jobs] Scheduled release-reservation for session ${sessionId} in 10 min`);

  return jobId;
}

/**
 * Отмена освобождения резерва (при оформлении заказа)
 */
export async function cancelReleaseReservation(sessionId: string): Promise<void> {
  const queue = getAutomationQueue();
  const jobId = `reserve-${sessionId}`;

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Jobs] Removed reservation job for session ${sessionId}`);
    }
  } catch (error) {
    console.warn(`[Jobs] Could not remove reservation job ${jobId}:`, error);
  }
}

/**
 * Планирование деактивации реферального периода (60 дней)
 */
export async function scheduleDeactivateReferral(bonusId: string): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `referral-end-${bonusId}`;
  const delay = 60 * 24 * 60 * 60 * 1000; // 60 дней

  await queue.add(
    "deactivate-referral",
    { bonusId },
    {
      delay,
      jobId,
    }
  );

  console.log(`[Jobs] Scheduled deactivate-referral in 60 days`);

  return jobId;
}

/**
 * Планирование периодического polling статусов доставки
 *
 * Запускается раз в час для проверки статусов заказов
 * через Track.global API
 */
export async function scheduleTrackingPolling(): Promise<void> {
  const queue = getAutomationQueue();

  const jobId = "tracking-polling-hourly";

  // Удалить старый job если есть (при перезапуске)
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch {
    // Игнорируем ошибку
  }

  // Удалить старые repeatable jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "tracking-polling") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Добавить повторяющийся job каждый час
  await queue.add(
    "tracking-polling",
    {},
    {
      jobId,
      repeat: {
        every: 60 * 60 * 1000, // 1 час
      },
    }
  );

  console.log("[Jobs] Scheduled tracking-polling every hour");
}

/**
 * Планирование синхронизации данных Avito.
 *
 * Антидетект: вместо фиксированного интервала (каждые 15 мин ровно)
 * используем self-rescheduling с jitter и учётом времени суток.
 * Каждый запуск планирует следующий через случайный интервал:
 * - День: ~12-18 мин
 * - Утро/вечер: ~18-27 мин
 * - Ночь: ~45-60 мин
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

  // Первый запуск — через случайный интервал
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

  // Удалить предыдущий pending job если есть
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

  console.log(
    `[Jobs] Rescheduled sync-avito-data in ${Math.round(nextDelay / 1000 / 60)} min`
  );
}

/**
 * Планирование получения статистики Avito за сегодня.
 * Запускается с задержкой 61с после основной синхронизации
 * (V2 Stats API: rate limit 1 req/min).
 */
export async function scheduleAvitoTodayStats(userId: string, itemIds: number[]): Promise<string> {
  const queue = getAutomationQueue();

  const jobId = `avito-today-stats-${userId}`;

  // Удалить предыдущий job если ещё не выполнен
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
    { userId, itemIds },
    {
      delay: 61_000, // 61с — V2 rate limit 1 req/min
      jobId,
    }
  );

  console.log(
    `[Jobs] Scheduled sync-avito-today-stats for ${userId} (${itemIds.length} items) in 61s`
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
        pattern: "0 0 * * *", // 00:00 UTC = 03:00 МСК
      },
    }
  );

  console.log("[Jobs] Scheduled learn-from-corrections daily at 03:00 MSK");
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
        pattern: "5 21 * * *", // 21:05 UTC = 00:05 МСК
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

  console.log(
    `[Jobs] Rescheduled sync-avito-orders in ${Math.round(nextDelay / 1000 / 60)} min`
  );
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

  // Удалить старые repeatable jobs (в т.ч. если флаг включили после)
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === "avito-relogin-check") {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // AVITO_DISABLE_RELOGIN=1 — отключает периодический relogin-check.
  // Полезно когда datacenter-IPv4 прокси выгорают за 1-2 login → каждые 10 мин
  // jobs сжигают доверие IP и блокируют SMS rate-limit. Включай когда есть
  // мобильный прокси или починена ротация.
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
        every: 10 * 60 * 1000, // каждые 10 минут
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

  // Удалить старые repeatable jobs
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
        every: 30 * 60 * 1000, // каждые 30 минут
      },
    }
  );

  console.log("[Jobs] Scheduled proxy-health-check every 30 min");
}

/**
 * Standalone: периодический синк баланса/аванса/рейтинга/расхода на
 * продвижение через Avito OAuth. Каждые 4 часа.
 */
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
      repeat: { every: 4 * 60 * 60 * 1000 }, // каждые 4 часа
    }
  );
  console.log("[Jobs] Scheduled sync-avito-balance every 4h");
}

// =============================================================================
// Standalone: действия над объявлением (вкл/выкл/удаление) через браузер
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
// Standalone: автопостинг объявления через браузер (Фаза 4)
// =============================================================================
export async function scheduleAvitoPostListing(postJobId: string): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = `post-listing-${postJobId}`;
  await queue.add(
    "avito-post-listing",
    { postJobId } as AvitoPostListingJobData,
    { jobId }
  );
  console.log(`[Jobs] Scheduled avito-post-listing for ${postJobId}`);
  return jobId;
}

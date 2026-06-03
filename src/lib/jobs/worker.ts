/**
 * BullMQ Worker для обработки автоматизаций
 *
 * Запуск:
 * - Standalone: npx ts-node src/lib/jobs/worker.ts
 * - В dev: через API route /api/jobs/worker (long polling)
 * - В production: отдельный процесс
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection, closeRedisConnection } from "./connection";
import {
  sweepExpiredOrders as handleSweepExpired,
  sweepStuckSendByDaily as handleSweepSendByDaily,
  sweepStuckPickupByDaily as handleSweepPickupByDaily,
} from "./sweep-expired-orders";
import {
  handleMoveToTrash,
  handleReleaseReservation,
  handleSyncAvitoData,
  handleSyncAvitoTodayStats,
  handleGenerateSalesDraft,
  handleSendApprovedDraft,
  handleLearnFromCorrections,
  handleAggregateSalesStats,
  handleAvitoLogin,
  handleSyncAvitoOrders,
  handleAvitoReloginCheck,
  handleProxyHealthCheck,
  handleUpdateShipperScores,
  handleRunFraudDetectors,
  handleRecognizeReceipt,
  handleExpireUnpaidOrder,
  handleExpirePendingOrder,
  handleRecognizePendingReceipt,
  handlePartnerPaymentExpire,
  handlePartnerReceiptsDigest,
  handleDirectorPaymentExpire,
  handleDirectorReceiptsDigest,
  handleWithdrawalRequestsDigest,
  handleShipperPoolDigest,
  handleExpiredOrdersMorningDigest,
  handleExpireSendBy,
  handleExpirePickupBy,
  handleDailyShipperCleanup,
  handleAutoResumeProblem,
  handleSyncAvitoBalance,
  handleAvitoItemAction,
  handleAvitoPostListing,
  handleAvitoGeneratePhoto,
  handleNightlyCoverGeneration,
  handleNotifyVibeFrozen,
  handleTrumpetNotify,
  handleAvitoRequestSize,
  handleAvitoProcessAwaitingSize,
} from "./handlers";
import type {
  RecognizeReceiptJobData,
  ExpireUnpaidOrderJobData,
  ExpirePendingOrderJobData,
  RecognizePendingReceiptJobData,
  PartnerPaymentExpireJobData,
  PartnerReceiptsDigestJobData,
  DirectorPaymentExpireJobData,
  DirectorReceiptsDigestJobData,
  WithdrawalRequestsDigestJobData,
  ExpireSendByJobData,
  ExpirePickupByJobData,
  AutoResumeProblemJobData,
  NotifyVibeFrozenJobData,
  TrumpetNotifyJobData,
} from "./queues";

// Singleton для воркера
let workerInstance: Worker | null = null;

/**
 * Главный обработчик — роутер для всех типов задач
 */
async function processJob(job: Job): Promise<void> {
  console.log(`[Worker] Processing job ${job.name} (id: ${job.id})`);

  const startTime = Date.now();

  try {
    switch (job.name) {
      case "move-to-trash":
        await handleMoveToTrash(job as Job<{ orderId: string }>);
        break;

      // Phase C: новые jobs (BUSINESS_LOGIC.md §14)
      case "expire-send-by":
        await handleExpireSendBy(job as Job<ExpireSendByJobData>);
        break;

      case "expire-pickup-by":
        await handleExpirePickupBy(job as Job<ExpirePickupByJobData>);
        break;

      case "daily-shipper-cleanup":
        await handleDailyShipperCleanup(job);
        break;

      case "auto-resume-problem":
        await handleAutoResumeProblem(job as Job<AutoResumeProblemJobData>);
        break;

      case "notify-vibe-frozen":
        await handleNotifyVibeFrozen(job as Job<NotifyVibeFrozenJobData>);
        break;

      case "trumpet-notify":
        await handleTrumpetNotify(job as Job<TrumpetNotifyJobData>);
        break;

      case "release-reservation":
        await handleReleaseReservation(job as Job<{ productSizeId: string; sessionId: string }>);
        break;

      case "sync-avito-data":
        await handleSyncAvitoData(job);
        break;

      case "sync-avito-today-stats":
        await handleSyncAvitoTodayStats(job);
        break;

      // AI Sales Agent
      case "generate-sales-draft":
        await handleGenerateSalesDraft(job);
        break;

      case "send-approved-draft":
        await handleSendApprovedDraft(job);
        break;

      case "learn-from-corrections":
        await handleLearnFromCorrections(job);
        break;

      case "aggregate-sales-stats":
        await handleAggregateSalesStats(job);
        break;

      // Avito browser sessions
      case "avito-login":
        await handleAvitoLogin(job as Job<{ userId: string }>);
        break;

      case "sync-avito-orders":
        await handleSyncAvitoOrders(job as Job<{ userId?: string }>);
        break;

      case "avito-relogin-check":
        await handleAvitoReloginCheck(job);
        break;

      case "proxy-health-check":
        await handleProxyHealthCheck(job);
        break;

      case "update-shipper-scores":
        await handleUpdateShipperScores(job);
        break;

      case "run-fraud-detectors":
        await handleRunFraudDetectors(job);
        break;

      case "recognize-receipt":
        await handleRecognizeReceipt(job as Job<RecognizeReceiptJobData>);
        break;

      case "expire-unpaid-order":
        await handleExpireUnpaidOrder(job as Job<ExpireUnpaidOrderJobData>);
        break;

      case "expire-pending-order":
        await handleExpirePendingOrder(job as Job<ExpirePendingOrderJobData>);
        break;

      case "recognize-pending-receipt":
        await handleRecognizePendingReceipt(job as Job<RecognizePendingReceiptJobData>);
        break;

      case "partner-payment-expire":
        await handlePartnerPaymentExpire(job as Job<PartnerPaymentExpireJobData>);
        break;

      case "partner-receipts-digest":
        await handlePartnerReceiptsDigest(job as Job<PartnerReceiptsDigestJobData>);
        break;

      case "director-payment-expire":
        await handleDirectorPaymentExpire(job as Job<DirectorPaymentExpireJobData>);
        break;

      case "director-receipts-digest":
        await handleDirectorReceiptsDigest(job as Job<DirectorReceiptsDigestJobData>);
        break;

      case "withdrawal-requests-digest":
        await handleWithdrawalRequestsDigest(job as Job<WithdrawalRequestsDigestJobData>);
        break;

      case "shipper-pool-digest":
        await handleShipperPoolDigest(job);
        break;

      case "expired-orders-morning-digest":
        await handleExpiredOrdersMorningDigest(job);
        break;

      case "sweep-expired":
        await handleSweepExpired();
        break;

      case "sweep-send-by-daily":
        await handleSweepSendByDaily();
        break;

      case "sweep-pickup-by-daily":
        await handleSweepPickupByDaily();
        break;

      case "sync-avito-balance":
        await handleSyncAvitoBalance(job);
        break;
      case "avito-item-action":
        await handleAvitoItemAction(job);
        break;

      case "avito-post-listing":
        await handleAvitoPostListing(job);
        break;

      // OURS: AI cover-autogen + per-product photo ladder
      case "avito-generate-photo":
        await handleAvitoGeneratePhoto(job);
        break;

      case "nightly-cover-generation":
        await handleNightlyCoverGeneration(job);
        break;

      // THEIRS: Avito-Orders size request flow
      case "avito-request-size":
        await handleAvitoRequestSize(job);
        break;

      case "avito-process-awaiting-size":
        await handleAvitoProcessAwaitingSize(job);
        break;

      default:
        console.warn(`[Worker] Unknown job type: ${job.name}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Worker] Job ${job.name} completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Worker] Job ${job.name} failed after ${duration}ms:`, error);
    throw error; // BullMQ будет ретраить
  }
}

/**
 * Создать и запустить воркер
 */
export function startWorker(): Worker {
  if (workerInstance) {
    console.log("[Worker] Worker already running");
    return workerInstance;
  }

  console.log("[Worker] Starting automation worker...");
  // Баннер идентичности: видно, на каком prefix сидит воркер и что это СВЕЖИЙ код
  // (per-product лестница + sourcePresetIds). Если в логах живого воркера этой строки
  // нет — он на старой кодовой базе и его джобы будут вести себя иначе.
  console.log(
    `[Worker] BULLMQ_PREFIX=${process.env.BULLMQ_PREFIX || "(default: bull)"} · queue=automation · ` +
      `code=per-product-ladder+sourcePresetIds`
  );

  workerInstance = new Worker("automation", processJob, {
    connection: getRedisConnection(),
    // Должен совпадать с prefix очереди (см. queues.ts) — изоляция по среде.
    prefix: process.env.BULLMQ_PREFIX || undefined,
    concurrency: 5, // Параллельная обработка до 5 задач
    limiter: {
      max: 100, // Максимум 100 задач
      duration: 60000, // В минуту
    },
  });

  // Обработка событий воркера
  workerInstance.on("completed", (job) => {
    console.log(`[Worker] ✓ Job ${job.name} (${job.id}) completed`);
  });

  workerInstance.on("failed", (job, error) => {
    console.error(`[Worker] ✗ Job ${job?.name} (${job?.id}) failed:`, error.message);
    // TODO: Отправить алерт владельцу при критических ошибках
  });

  workerInstance.on("error", (error) => {
    console.error("[Worker] Worker error:", error);
  });

  workerInstance.on("stalled", (jobId) => {
    console.warn(`[Worker] Job ${jobId} stalled`);
  });

  console.log("[Worker] Automation worker started");

  return workerInstance;
}

/**
 * Остановить воркер
 */
export async function stopWorker(): Promise<void> {
  if (workerInstance) {
    console.log("[Worker] Stopping automation worker...");
    await workerInstance.close();
    workerInstance = null;
    await closeRedisConnection();
    console.log("[Worker] Automation worker stopped");
  }
}

/**
 * Проверить состояние воркера
 */
export function isWorkerRunning(): boolean {
  return workerInstance !== null && !workerInstance.closing;
}

/**
 * Получить статистику воркера
 */
export async function getWorkerStats(): Promise<{
  isRunning: boolean;
  processed: number;
  failed: number;
} | null> {
  if (!workerInstance) {
    return null;
  }

  // BullMQ не предоставляет встроенную статистику воркера,
  // но можно получить из очереди
  return {
    isRunning: !workerInstance.closing,
    processed: 0, // TODO: Реализовать счётчики
    failed: 0,
  };
}

// Graceful shutdown при завершении процесса
if (typeof process !== "undefined") {
  const shutdown = async () => {
    console.log("\n[Worker] Received shutdown signal...");
    await stopWorker();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Если запущен напрямую — стартуем воркер
// Для ESM используем import.meta.url проверку в scripts/worker.ts

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
  handleExpireOrder,
  handleDeadlineReminder,
  handleMoveToTrash,
  handleReturnArrived,
  handleDisposeTrash,
  handleReleaseReservation,
  handleDeactivateReferral,
  handleTrackingPolling,
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
  handleAvitoItemAction,
  handleAvitoPostListing,
} from "./handlers";

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
      case "expire-order":
        await handleExpireOrder(job as Job<{ orderId: string }>);
        break;

      case "deadline-reminder":
      case "deadline-reminder-same-day":
        await handleDeadlineReminder(job as Job<{ orderId: string }>);
        break;

      case "move-to-trash":
        await handleMoveToTrash(job as Job<{ orderId: string }>);
        break;

      case "return-arrived":
        await handleReturnArrived(job as Job<{ orderId: string }>);
        break;

      case "dispose-trash":
        await handleDisposeTrash(job as Job<{ orderId: string }>);
        break;

      case "release-reservation":
        await handleReleaseReservation(job as Job<{ productSizeId: string; sessionId: string }>);
        break;

      case "deactivate-referral":
        await handleDeactivateReferral(job as Job<{ bonusId: string }>);
        break;

      case "tracking-polling":
        await handleTrackingPolling(job);
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

      // Standalone: управление объявлениями + автопостинг
      case "avito-item-action":
        await handleAvitoItemAction(job as Job<import("./queues").AvitoItemActionJobData>);
        break;

      case "avito-post-listing":
        await handleAvitoPostListing(
          job as Job<import("./queues").AvitoPostListingJobData>
        );
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

  workerInstance = new Worker("automation", processJob, {
    connection: getRedisConnection(),
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

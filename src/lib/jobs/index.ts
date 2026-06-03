/**
 * BullMQ Jobs System
 *
 * Event-driven автоматизации (BUSINESS_LOGIC.md §14).
 *
 * Phase B: удалена legacy-инфраструктура (Track.global, deadline-reminder,
 * return_arrived, dispose-trash). Phase C добавит новые jobs:
 *   expire-send-by, expire-pickup-by, daily-shipper-cleanup,
 *   notify-vibe-frozen, auto-resume-problem, trumpet-notify.
 */

// Connection
export { getRedisConnection, closeRedisConnection, isRedisConnected } from "./connection";

// Queues и хелперы
export {
  getAutomationQueue,
  scheduleMoveToTrash,
  cancelMoveToTrash,
  scheduleReleaseReservation,
  cancelReleaseReservation,
  cancelExpireSendBy,
  cancelExpirePickupBy,
  scheduleDailyShipperCleanup,
  scheduleAutoResumeProblem,
  scheduleNotifyVibeFrozen,
  scheduleTrumpetNotifications,
  cancelTrumpetNotifications,
} from "./queues";

// Types
export type {
  AutomationJobName,
  AutomationJobData,
  MoveToTrashJobData,
  ReleaseReservationJobData,
  ExpireSendByJobData,
  ExpirePickupByJobData,
  AutoResumeProblemJobData,
  NotifyVibeFrozenJobData,
  TrumpetNotifyJobData,
} from "./queues";

// Worker
export { startWorker, stopWorker, isWorkerRunning, getWorkerStats } from "./worker";

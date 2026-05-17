/**
 * BullMQ Jobs System
 *
 * Event-driven автоматизации для:
 * - Автоотмена заказов по дедлайну
 * - Напоминания о дедлайне
 * - Перевод возвратов в trash/disposed
 * - Освобождение резервов
 * - Реферальные бонусы
 *
 * Использование:
 * ```typescript
 * import { scheduleOrderExpiration, cancelOrderJobs } from '@/lib/jobs';
 *
 * // При создании заказа
 * await scheduleOrderExpiration(orderId, deliveryDeadline);
 *
 * // При отправке заказа
 * await cancelOrderJobs(orderId);
 * ```
 */

// Connection
export { getRedisConnection, closeRedisConnection, isRedisConnected } from "./connection";

// Queues и хелперы
export {
  getAutomationQueue,
  scheduleOrderExpiration,
  scheduleDeadlineReminder,
  cancelOrderJobs,
  scheduleMoveToTrash,
  cancelMoveToTrash,
  scheduleReturnArrived,
  cancelReturnArrived,
  scheduleDisposeTrash,
  cancelDisposeTrash,
  scheduleReleaseReservation,
  cancelReleaseReservation,
  scheduleDeactivateReferral,
} from "./queues";

// Types
export type {
  AutomationJobName,
  AutomationJobData,
  ExpireOrderJobData,
  DeadlineReminderJobData,
  MoveToTrashJobData,
  ReturnArrivedJobData,
  DisposeTrashJobData,
  ReleaseReservationJobData,
  DeactivateReferralJobData,
} from "./queues";

// Worker
export { startWorker, stopWorker, isWorkerRunning, getWorkerStats } from "./worker";

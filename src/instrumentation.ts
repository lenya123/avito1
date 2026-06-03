export async function register() {
  // Устойчивые сетевые таймауты для всех fetch (Supabase/Telegram/Gemini) — раньше всего,
  // чтобы Next-роуты не падали на 10-сек connect-таймауте при медленной сети.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/net/resilient-dispatcher");
  }
  // Sentry: инициализируем до остального, чтобы ловить ранние ошибки.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  // Worker запускается только на сервере (не в Edge, не в браузере).
  // WORKER_IN_WEB=false отключает встроенный воркер в Next-процессе — нужно когда
  // рядом крутится отдельный воркер (npm run dev:all → worker:dev / прод-воркер):
  // иначе один и тот же job обрабатывается дважды ([web] и [worker]) — двойной
  // расход Gemini/CPU и блокировка event-loop Next тяжёлой генерацией.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.REDIS_URL &&
    process.env.WORKER_IN_WEB !== "false"
  ) {
    const { startWorker } = await import("@/lib/jobs");
    try {
      startWorker();
      console.log("[Instrumentation] BullMQ worker auto-started");
    } catch (error) {
      console.error("[Instrumentation] Failed to start worker:", error);
    }

    // Sweep при старте — подчищает всё что worker пропустил пока сервер был выключен
    const { sweepExpiredOrders, sweepStuckSendByDaily, sweepStuckPickupByDaily } =
      await import("@/lib/jobs/sweep-expired-orders");
    sweepExpiredOrders().catch((error) => {
      console.error("[Instrumentation] Sweep failed:", error);
    });
    // Однократный catchup — на случай если сервер был выключен в момент 00:03 МСК
    // и ежедневные sweep'ы send_by / pickup_by пропущены.
    sweepStuckSendByDaily().catch((error) => {
      console.error("[Instrumentation] send-by daily catchup failed:", error);
    });
    sweepStuckPickupByDaily().catch((error) => {
      console.error("[Instrumentation] pickup-by daily catchup failed:", error);
    });

    const {
      scheduleSweep,
      scheduleSendBySweepDaily,
      schedulePickupBySweepDaily,
      scheduleShipperScoreUpdate,
      scheduleNightlyCoverGeneration,
    } = await import("@/lib/jobs/queues");
    scheduleNightlyCoverGeneration().catch((error) => {
      console.error("[Instrumentation] Failed to schedule nightly cover generation:", error);
    });
    // Поминутный sweep — резервы / pending'и / unpaid / stuck-director.
    scheduleSweep().catch((error) => {
      console.error("[Instrumentation] Failed to schedule periodic sweep:", error);
    });
    // Ежедневный sweep send_by в 00:03 МСК — суточная единица, чаще не нужно.
    scheduleSendBySweepDaily().catch((error) => {
      console.error("[Instrumentation] Failed to schedule daily send-by sweep:", error);
    });
    // Ежедневный sweep pickup_by в 00:03 МСК (тот же таймер, отдельная функция).
    schedulePickupBySweepDaily().catch((error) => {
      console.error("[Instrumentation] Failed to schedule daily pickup-by sweep:", error);
    });

    // Ежедневное обновление ELO-score отправщиков в 01:00 МСК
    scheduleShipperScoreUpdate().catch((error) => {
      console.error("[Instrumentation] Failed to schedule shipper score update:", error);
    });
  }
}

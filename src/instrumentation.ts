/**
 * Next.js Instrumentation — запускается ОДИН раз при старте сервера.
 *
 * Автоматически поднимает BullMQ worker как child process.
 * Если Redis недоступен — сайт работает нормально, просто без фоновых задач.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.REDIS_URL) {
    console.warn("[instrumentation] REDIS_URL not set — worker disabled");
    return;
  }
  // Standalone: воркер запускается отдельным systemd-сервисом (avito-worker).
  // Включи INSTRUMENTATION_WORKER=1 чтобы Next.js также форкнул воркер
  // (для dev/одиночного процесса). В проде это вызывает гонку с systemd-воркером
  // на одну BullMQ-очередь и на прокси.
  if (process.env.INSTRUMENTATION_WORKER !== "1") {
    console.log("[instrumentation] Worker fork disabled (use systemd avito-worker)");
    return;
  }

  setTimeout(() => {
    try {
      // Dynamic import через eval чтобы webpack не трейсил Node.js модули
      // eslint-disable-next-line no-eval
      const cp = eval('require("child_process")');
      // eslint-disable-next-line no-eval
      const p = eval('require("path")');

      const workerScript = p.resolve(process.cwd(), "scripts/worker.ts");

      const child = cp.fork(workerScript, [], {
        execArgv: ["-r", "tsx/cjs"],
        env: { ...process.env },
        stdio: "inherit",
      });

      child.on("error", (err: Error) => {
        console.error("[instrumentation] Worker error:", err.message);
      });

      child.on("exit", (code: number) => {
        if (code !== 0) {
          console.error(`[instrumentation] Worker exited with code ${code}`);
        }
      });

      console.log("[instrumentation] Worker started (PID:", child.pid, ")");
    } catch (err) {
      console.error("[instrumentation] Failed to start worker:", err);
    }
  }, 3000);
}

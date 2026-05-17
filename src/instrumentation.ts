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

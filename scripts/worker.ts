#!/usr/bin/env npx ts-node
/**
 * Standalone BullMQ Worker для production
 *
 * Запуск:
 *   npx ts-node scripts/worker.ts
 *   или
 *   node --loader ts-node/esm scripts/worker.ts
 *
 * Для production:
 *   npx tsx scripts/worker.ts
 *
 * Требует:
 *   - REDIS_URL в .env.local
 *   - NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY для обработчиков
 */

import { config } from "dotenv";
import { resolve } from "path";

// Загружаем .env.local (приоритет) или .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

// Проверяем обязательные переменные окружения
const requiredEnvVars = ["REDIS_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingVars.forEach((v) => console.error(`   - ${v}`));
  console.error("\nCopy .env.example to .env.local and fill in the values.");
  process.exit(1);
}

// Импортируем после проверки env
import { startWorker, stopWorker } from "../src/lib/jobs/worker";
import {
  scheduleAvitoSync,
  scheduleTrackingPolling,
  scheduleSalesLearning,
  scheduleSalesStatsAggregation,
  scheduleAvitoOrdersSync,
  scheduleAvitoReloginCheck,
  scheduleProxyHealthCheck,
  scheduleAvitoBalanceSync,
} from "../src/lib/jobs/queues";

console.log("🚀 Starting BullMQ Automation Worker...");
console.log(`   Redis: ${process.env.REDIS_URL?.replace(/:[^:@]+@/, ":***@")}`);
console.log(`   Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log("");

// Запускаем воркер
const worker = startWorker();

// Регистрируем repeatable jobs при старте (через IIFE — top-level await не поддерживается)
void (async () => {
  try {
    await Promise.all([
      scheduleAvitoSync(),
      scheduleTrackingPolling(),
      scheduleSalesLearning(),
      scheduleSalesStatsAggregation(),
      scheduleAvitoOrdersSync(),
      scheduleAvitoReloginCheck(),
      scheduleProxyHealthCheck(),
      scheduleAvitoBalanceSync(),
    ]);
    console.log("✅ Repeatable jobs registered.");
  } catch (err) {
    console.error("⚠️  Failed to register repeatable jobs:", err);
  }
})();

console.log("✅ Worker is running. Press Ctrl+C to stop.\n");

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n📴 Received ${signal}. Shutting down gracefully...`);
  await stopWorker();
  console.log("👋 Worker stopped. Goodbye!");
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Обработка необработанных ошибок
process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error);
  shutdown("uncaughtException");
});

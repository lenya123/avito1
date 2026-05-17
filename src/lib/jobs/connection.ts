/**
 * Redis connection для BullMQ
 * Используется для всех очередей и воркеров
 *
 * Используем RedisOptions вместо Redis instance для избежания
 * конфликта версий между ioredis и bullmq/ioredis
 */

import type { RedisOptions } from "bullmq";

// Кэшируем опции
let cachedOptions: RedisOptions | null = null;

/**
 * Получить опции подключения к Redis для BullMQ
 */
export function getRedisConnection(): RedisOptions {
  if (!cachedOptions) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error(
        "REDIS_URL не установлен. Добавьте в .env.local:\n" +
          "Local: REDIS_URL=redis://localhost:6379\n" +
          "Upstash: REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379"
      );
    }

    // Парсим URL для создания опций
    const url = new URL(redisUrl);
    const isTls = redisUrl.startsWith("rediss://");

    cachedOptions = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      maxRetriesPerRequest: null, // Требуется для BullMQ
      enableReadyCheck: false,
      ...(isTls && {
        tls: {
          rejectUnauthorized: false,
        },
      }),
    };

    console.log(`[Redis] Configured for ${url.hostname}:${url.port}${isTls ? " (TLS)" : ""}`);
  }

  return cachedOptions;
}

/**
 * Закрыть Redis connection
 * Примечание: при использовании RedisOptions BullMQ управляет соединениями сам
 */
export async function closeRedisConnection(): Promise<void> {
  cachedOptions = null;
  console.log("[Redis] Configuration cleared");
}

/**
 * Проверить наличие конфигурации Redis
 */
export function isRedisConnected(): boolean {
  return !!process.env.REDIS_URL;
}

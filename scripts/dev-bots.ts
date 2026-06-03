#!/usr/bin/env npx tsx
/**
 * Dev-only: запускает все 4 Telegram-бота в long-polling режиме.
 *
 * Запуск:
 *   npx tsx watch scripts/dev-bots.ts   (через npm run dev:bots)
 *   или как часть npm run dev:all (Next.js + worker + bots)
 *
 * Полностью заменяет webhook-туннель (cloudflared/ngrok/VS Code dev tunnel)
 * для локальной разработки. На prod (Vercel) запускаются webhook-роуты
 * /api/telegram/<bot> — этот скрипт там не нужен.
 *
 * Telegram запрещает одновременно polling + webhook на одном токене,
 * поэтому перед start каждого бота вызываем deleteWebhook (drop_pending=true)
 * — это безопасно: если на токене сидел prod-webhook, он временно слетит,
 * после возврата в prod нужно перевызвать `npm run webhooks:set <url>`.
 *
 * Требует в .env.local:
 *   - TELEGRAM_CUSTOMER_BOT_TOKEN
 *   - TELEGRAM_PARTNER_BOT_TOKEN
 *   - TELEGRAM_OWNER_BOT_TOKEN
 *   - TELEGRAM_SHIPPER_BOT_TOKEN
 *   - NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (хендлеры читают БД)
 */

import "../src/lib/net/resilient-dispatcher"; // устойчивые таймауты для всех fetch — ПЕРВЫМ
import { config } from "dotenv";
import { resolve } from "path";

// Загружаем .env.local (приоритет) или .env — паттерн из scripts/worker.ts.
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const requiredEnvVars = [
  "TELEGRAM_CUSTOMER_BOT_TOKEN",
  "TELEGRAM_PARTNER_BOT_TOKEN",
  "TELEGRAM_OWNER_BOT_TOKEN",
  "TELEGRAM_SHIPPER_BOT_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

// Director-bot опциональный — если токена нет, его не запускаем (но customer/partner/owner/shipper работают).
const optionalBots = ["TELEGRAM_DIRECTOR_BOT_TOKEN", "TELEGRAM_AIPHOTOS_BOT_TOKEN"];

const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingVars.forEach((v) => console.error(`   - ${v}`));
  console.error("\nCopy .env.example to .env.local and fill in the values.");
  process.exit(1);
}

// Импортируем после проверки env (createXxxBot читает токены из process.env).
import { Bot } from "grammy";
import { createCustomerBot } from "../src/lib/telegram/bots/customer-bot";
import { createPartnerBot } from "../src/lib/telegram/bots/partner-bot";
import { createOwnerBot } from "../src/lib/telegram/bots/owner-bot";
import { createShipperBot } from "../src/lib/telegram/bots/shipper-bot";
import { createDirectorBot } from "../src/lib/telegram/bots/director-bot";
import { createAiPhotosBot } from "../src/lib/telegram/bots/aiphotos-bot";

interface NamedBot {
  name: string;
  bot: Bot<any>;
}

const bots: NamedBot[] = [
  { name: "customer", bot: createCustomerBot() as Bot<any> },
  { name: "partner", bot: createPartnerBot() as Bot<any> },
  { name: "owner", bot: createOwnerBot() as Bot<any> },
  { name: "shipper", bot: createShipperBot() as Bot<any> },
];

// Director-bot подключаем только если токен задан (опциональный пятый бот).
if (process.env.TELEGRAM_DIRECTOR_BOT_TOKEN) {
  bots.push({ name: "director", bot: createDirectorBot() as Bot<any> });
} else {
  console.log("⏭  TELEGRAM_DIRECTOR_BOT_TOKEN не задан — director-bot не запущен.");
}

// AI-фото бот (@krossovodaiphotosbot) — сюда шлются обложки на «Четко/Переделай».
if (process.env.TELEGRAM_AIPHOTOS_BOT_TOKEN) {
  bots.push({ name: "aiphotos", bot: createAiPhotosBot() as Bot<any> });
} else {
  console.log("⏭  TELEGRAM_AIPHOTOS_BOT_TOKEN не задан — aiphotos-bot не запущен.");
}

console.log("🤖 Starting Telegram bots in long-polling mode...\n");

async function deleteWebhookWithRetry(name: string, bot: Bot<any>, attempts = 3): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  [${name}] deleteWebhook attempt ${i}/${attempts} failed: ${msg}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
  return false;
}

void (async () => {
  // Стартуем последовательно — избегаем гонок и transient-таймаутов
  // на холодных DNS/TCP-соединениях. На общую скорость старта влияет
  // незаметно (~1-2 секунды).
  for (const { name, bot } of bots) {
    const cleaned = await deleteWebhookWithRetry(name, bot);
    if (!cleaned) {
      console.error(`❌ [${name}] could not clear webhook — skipping. Other bots продолжают.`);
      continue;
    }
    void bot
      .start({
        allowed_updates: ["message", "callback_query", "inline_query", "chosen_inline_result"],
        onStart: (info) => {
          console.log(`✅ [${name}] started: @${info.username} (id=${info.id})`);
        },
      })
      .catch((error) => {
        console.error(`🔥 [${name}] polling crashed:`, error);
      });
  }
})();

// Graceful shutdown.
const shutdown = async (signal: string) => {
  console.log(`\n📴 Received ${signal}. Stopping bots...`);
  await Promise.all(
    bots.map(async ({ name, bot }) => {
      try {
        await bot.stop();
        console.log(`👋 [${name}] stopped.`);
      } catch (error) {
        console.error(`⚠️  [${name}] stop failed:`, error);
      }
    })
  );
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error);
  void shutdown("uncaughtException");
});

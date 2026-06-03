#!/usr/bin/env npx tsx
/**
 * Prod-only: разово устанавливает webhook'и для всех 4 ботов после деплоя.
 *
 * Запуск:
 *   npm run webhooks:set https://myshop.vercel.app
 *   или
 *   npx tsx scripts/set-webhooks.ts https://myshop.vercel.app
 *
 * Что делает:
 *   1. Читает 4 токена + TELEGRAM_WEBHOOK_SECRET из .env.local.
 *   2. Для каждого бота вызывает setWebhook на <base>/api/telegram/<role>.
 *   3. Печатает результат + exit 0/1 по совокупности.
 *
 * Когда запускать:
 *   - После первого деплоя на Vercel.
 *   - После смены кастомного домена.
 *   - После ротации TELEGRAM_WEBHOOK_SECRET.
 *   - Если бот завис в polling-режиме (после dev-сессии) и нужно
 *     вернуть его в webhook-режим на prod.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: npm run webhooks:set <base-url>");
  console.error("Example: npm run webhooks:set https://myshop.vercel.app");
  process.exit(1);
}

if (!/^https:\/\//.test(baseUrl)) {
  console.error("❌ Base URL must start with https:// — Telegram requires HTTPS for webhooks.");
  process.exit(1);
}

const requiredEnvVars = [
  "TELEGRAM_CUSTOMER_BOT_TOKEN",
  "TELEGRAM_PARTNER_BOT_TOKEN",
  "TELEGRAM_OWNER_BOT_TOKEN",
  "TELEGRAM_SHIPPER_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
];

const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingVars.forEach((v) => console.error(`   - ${v}`));
  process.exit(1);
}

import { Bot } from "grammy";

const cleanBase = baseUrl.replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET!;

const targets = [
  { role: "customer", token: process.env.TELEGRAM_CUSTOMER_BOT_TOKEN! },
  { role: "partner", token: process.env.TELEGRAM_PARTNER_BOT_TOKEN! },
  { role: "owner", token: process.env.TELEGRAM_OWNER_BOT_TOKEN! },
  { role: "shipper", token: process.env.TELEGRAM_SHIPPER_BOT_TOKEN! },
];

console.log(`🌐 Setting webhooks on ${cleanBase}\n`);

void (async () => {
  let failed = 0;
  for (const { role, token } of targets) {
    const url = `${cleanBase}/api/telegram/${role}`;
    try {
      const bot = new Bot(token);
      await bot.api.setWebhook(url, {
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
      });
      console.log(`✅ ${role}: ${url}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ ${role}: ${msg}`);
      failed++;
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`⚠️  ${failed}/${targets.length} webhook(s) failed.`);
    process.exit(1);
  }
  console.log("🎉 All webhooks set successfully.");
  process.exit(0);
})();

/**
 * Скрипт для настройки Telegram webhooks
 *
 * Запуск: npx ts-node src/lib/telegram/setup-webhooks.ts
 *
 * Или через API:
 * GET /api/telegram/client?url=https://your-domain.com/api/telegram/client
 */

import { Bot } from "grammy";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

interface BotConfig {
  name: string;
  token: string | undefined;
  path: string;
}

const bots: BotConfig[] = [
  {
    name: "Client Bot",
    token: process.env.TELEGRAM_CLIENT_BOT_TOKEN,
    path: "/api/telegram/client",
  },
  {
    name: "Shipper Bot",
    token: process.env.TELEGRAM_SHIPPER_BOT_TOKEN,
    path: "/api/telegram/shipper",
  },
  {
    name: "Owner Bot",
    token: process.env.TELEGRAM_OWNER_BOT_TOKEN,
    path: "/api/telegram/owner",
  },
];

async function setupWebhooks() {
  console.log("Setting up Telegram webhooks...\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Secret: ${SECRET ? "configured" : "not set"}\n`);

  for (const config of bots) {
    if (!config.token) {
      console.log(`❌ ${config.name}: Token not set, skipping`);
      continue;
    }

    try {
      const bot = new Bot(config.token);
      const webhookUrl = `${BASE_URL}${config.path}`;

      await bot.api.setWebhook(webhookUrl, {
        secret_token: SECRET,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      });

      const info = await bot.api.getWebhookInfo();
      console.log(`✅ ${config.name}: ${info.url}`);
    } catch (error) {
      console.error(`❌ ${config.name}: ${error}`);
    }
  }

  console.log("\nDone!");
}

async function deleteWebhooks() {
  console.log("Deleting Telegram webhooks...\n");

  for (const config of bots) {
    if (!config.token) {
      console.log(`⏭️ ${config.name}: Token not set, skipping`);
      continue;
    }

    try {
      const bot = new Bot(config.token);
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      console.log(`✅ ${config.name}: Webhook deleted`);
    } catch (error) {
      console.error(`❌ ${config.name}: ${error}`);
    }
  }

  console.log("\nDone!");
}

async function getWebhookInfo() {
  console.log("Getting Telegram webhook info...\n");

  for (const config of bots) {
    if (!config.token) {
      console.log(`⏭️ ${config.name}: Token not set`);
      continue;
    }

    try {
      const bot = new Bot(config.token);
      const info = await bot.api.getWebhookInfo();

      console.log(`📌 ${config.name}:`);
      console.log(`   URL: ${info.url || "not set"}`);
      console.log(`   Pending updates: ${info.pending_update_count}`);
      if (info.last_error_message) {
        console.log(`   Last error: ${info.last_error_message}`);
      }
      console.log();
    } catch (error) {
      console.error(`❌ ${config.name}: ${error}`);
    }
  }
}

// CLI
const command = process.argv[2];

switch (command) {
  case "setup":
    setupWebhooks();
    break;
  case "delete":
    deleteWebhooks();
    break;
  case "info":
    getWebhookInfo();
    break;
  default:
    console.log("Usage:");
    console.log("  npx ts-node src/lib/telegram/setup-webhooks.ts setup  - Set webhooks");
    console.log("  npx ts-node src/lib/telegram/setup-webhooks.ts delete - Delete webhooks");
    console.log("  npx ts-node src/lib/telegram/setup-webhooks.ts info   - Get webhook info");
}

export { setupWebhooks, deleteWebhooks, getWebhookInfo };

/**
 * Webhook endpoint для бота владельца
 *
 * POST /api/telegram/owner
 */

import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { createOwnerBot } from "@/lib/telegram/bots/owner-bot";

// Lazy-инициализация бота
let bot: ReturnType<typeof createOwnerBot> | null = null;
let handleUpdate: ((request: Request) => Promise<Response>) | null = null;

function getBot() {
  if (!bot) {
    bot = createOwnerBot();
    handleUpdate = webhookCallback(bot, "std/http", {
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
    });
  }
  return { bot, handleUpdate: handleUpdate! };
}

export async function POST(request: NextRequest) {
  try {
    const { handleUpdate } = getBot();
    return await handleUpdate(request);
  } catch (error) {
    console.error("Owner bot webhook error:", error);
    // Всегда 200 — иначе Telegram будет повторять update и заблокирует очередь
    return NextResponse.json({ ok: true });
  }
}

// Для настройки webhook через GET (dev only)
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { bot } = getBot();
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    try {
      const info = await bot.api.getWebhookInfo();
      return NextResponse.json(info);
    } catch {
      return NextResponse.json({ error: "Failed to get webhook info" }, { status: 500 });
    }
  }

  try {
    await bot.api.setWebhook(url, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
    });

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("Failed to set webhook:", error);
    return NextResponse.json({ error: "Failed to set webhook" }, { status: 500 });
  }
}

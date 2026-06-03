/**
 * Webhook endpoint для partner-bot.
 *
 * POST /api/telegram/partner
 */

import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { createPartnerBot } from "@/lib/telegram/bots/partner-bot";

let bot: ReturnType<typeof createPartnerBot> | null = null;
let handleUpdate: ((request: Request) => Promise<Response>) | null = null;

function getBot() {
  if (!bot) {
    bot = createPartnerBot();
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
    console.error("Partner bot webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

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

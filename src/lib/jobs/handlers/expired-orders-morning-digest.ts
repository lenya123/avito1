/**
 * Утренний DM владельцу: сколько заказов сгорело за прошедшие сутки
 * (cancel_reason='send_by_expired') + кто из отправщиков должен был
 * работать вчера по `work_days`.
 *
 * Cron: 10:00 МСК ежедневно. Если за прошлые сутки ничего не сгорело —
 * молчим, DM не шлём.
 *
 * Цель: дать владельцу быстрый сигнал к утру «вчера N заказов утекли,
 * кому позвонить» — вместо того чтобы он сам ходил в админку и считал.
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Bot } from "grammy";
import { moscowToday, moscowLocalToDate, moscowParts } from "@/lib/utils/moscow-time";

function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

function pluralOrders(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заказ";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "заказа";
  return "заказов";
}

function formatPrice(rub: number): string {
  return `${rub.toLocaleString("ru-RU")}₽`;
}

/** Day-of-week вчерашнего дня в Москве, в PostgreSQL-конвенции (0=Sun..6=Sat). */
function moscowYesterdayDow(): { dateStr: string; dow: number } {
  const today = moscowToday();
  const todayMidnight = moscowLocalToDate(today, "00:00:00");
  const yesterday = new Date(todayMidnight.getTime() - 24 * 60 * 60 * 1000);
  const parts = moscowParts(yesterday);
  const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  // Date.UTC + getUTCDay воссоздаёт DOW для местного «дня» без сдвигов TZ.
  const dow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return { dateStr, dow };
}

export async function handleExpiredOrdersMorningDigest(_job: Job): Promise<void> {
  const supabase = getServiceClient();

  const today = moscowToday();
  const { dateStr: yesterdayStr, dow: yesterdayDow } = moscowYesterdayDow();
  const startISO = moscowLocalToDate(yesterdayStr, "00:00:00").toISOString();
  const endISO = moscowLocalToDate(today, "00:00:00").toISOString();

  const { data: expired } = await supabase
    .from("orders")
    .select("id, order_number, client_price")
    .eq("cancel_reason", "send_by_expired")
    .gte("cancelled_at", startISO)
    .lt("cancelled_at", endISO);

  const count = expired?.length ?? 0;
  if (count === 0) {
    console.log("[expired-orders-morning-digest] nothing expired yesterday — skip");
    return;
  }

  const totalSum = (expired ?? []).reduce((acc, o) => acc + Number(o.client_price ?? 0), 0);

  // Кто работал вчера: work_days содержит вчерашний DOW, либо work_days
  // не задан/пуст (= «работает все дни»).
  const { data: shippers } = await supabase
    .from("users")
    .select("name, work_days")
    .eq("role", "shipper")
    .eq("is_blocked", false);

  const yesterdayShippers = (shippers ?? [])
    .filter((s) => {
      const wd = (s.work_days as number[] | null) ?? null;
      if (!wd || wd.length === 0) return true;
      return wd.includes(yesterdayDow);
    })
    .map((s) => s.name)
    .filter((n): n is string => Boolean(n));

  const shipperLine =
    yesterdayShippers.length > 0
      ? `Вчера должны были работать: ${yesterdayShippers.join(", ")}.`
      : `Вчера никто не был в графике (нет shipper'ов с work_days на этот день).`;

  const text =
    `🔥 Вчера сгорело ${count} ${pluralOrders(count)} на ${formatPrice(totalSum)}.\n\n` +
    `Никто не успел сдать в ПВЗ до полуночи — заказы отменены, баланс клиентам вернулся.\n\n` +
    `${shipperLine}`;

  const ownerId = parseInt(process.env.OWNER_TELEGRAM_ID || "0", 10);
  const token = process.env.TELEGRAM_OWNER_BOT_TOKEN;
  if (!ownerId || !token) {
    console.warn("[expired-orders-morning-digest] OWNER_TELEGRAM_ID/TOKEN missing — skip DM");
    return;
  }

  try {
    const bot = new Bot(token);
    await bot.api.sendMessage(ownerId, text);
    console.log(`[expired-orders-morning-digest] sent owner DM (count=${count}, sum=${totalSum})`);
  } catch (err) {
    console.error("[expired-orders-morning-digest] DM failed:", err);
  }
}

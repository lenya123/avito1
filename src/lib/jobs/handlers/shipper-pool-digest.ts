/**
 * Обработчик shipper-pool-digest — дневной DM-дайджест отправщикам.
 *
 * Расписание: cron каждые 30 мин. Handler сам решает на каждом тике —
 * шлём ли сегодня. Условия отправки:
 *  - сейчас в Москве уже прошёл `business_settings.send_by_today_cutoff`
 *    (после него клиент уже не может выбрать «сегодня» как send_by, пул
 *     фиксируется до полуночи);
 *  - сегодня (МСК) ещё не отправляли — `last_shipper_pool_digest_date`
 *    меньше moscowToday().
 *
 * Что в DM:
 *  - pool_count — сколько `paid` без shipper'а в видимости отправщиков
 *    владельца (source_warehouse='owner', claimed_by IS NULL);
 *  - urgent_count — сколько у ЭТОГО shipper'а заказов в `collecting`/
 *    `problem` с send_by = сегодня (его персональный «горит сегодня»).
 *
 * Шлём только тем, у кого хотя бы одно из чисел > 0. Если оба нуля —
 * молчим. После прохода маркируем дату — больше сегодня не запустится.
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Bot } from "grammy";
import { moscowToday, moscowTimeNow } from "@/lib/utils/moscow-time";

function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

const DEFAULT_CUTOFF = "16:00:00";

function buildText(poolCount: number, urgentCount: number): string {
  const lines: string[] = [];
  if (poolCount > 0) {
    lines.push(`🔔 В пуле ${poolCount} ${pluralOrders(poolCount)}`);
  }
  if (urgentCount > 0) {
    lines.push(
      `⚠️ У тебя в работе ${urgentCount} ${pluralOrders(urgentCount)} с дедлайном сегодня — успей сдать до полуночи`
    );
  }
  return lines.join("\n");
}

function pluralOrders(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "новый заказ";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "новых заказа";
  return "новых заказов";
}

export async function handleShipperPoolDigest(_job: Job): Promise<void> {
  const supabase = getServiceClient();

  const { data: settings } = await supabase
    .from("business_settings")
    .select("id, send_by_today_cutoff, last_shipper_pool_digest_date")
    .limit(1)
    .maybeSingle();

  if (!settings) {
    console.warn("[shipper-pool-digest] business_settings row not found — skip");
    return;
  }

  const cutoff = (settings.send_by_today_cutoff as string | null) ?? DEFAULT_CUTOFF;
  const lastSentDate = (settings.last_shipper_pool_digest_date as string | null) ?? null;
  const today = moscowToday();
  const nowMsk = moscowTimeNow();

  if (lastSentDate === today) {
    console.log("[shipper-pool-digest] already sent today — skip");
    return;
  }
  if (nowMsk < cutoff) {
    console.log(`[shipper-pool-digest] before cutoff (now=${nowMsk}, cutoff=${cutoff}) — skip`);
    return;
  }

  const { count: poolCountRaw } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "paid")
    .eq("source_warehouse", "owner")
    .is("claimed_by", null);
  const poolCount = poolCountRaw ?? 0;

  const { data: shippers } = await supabase
    .from("users")
    .select("id, telegram_id")
    .eq("role", "shipper")
    .eq("is_blocked", false)
    .gt("telegram_id", 0);

  const token = process.env.TELEGRAM_SHIPPER_BOT_TOKEN;
  if (!token) {
    console.error("[shipper-pool-digest] TELEGRAM_SHIPPER_BOT_TOKEN missing");
  }
  const bot = token ? new Bot(token) : null;

  for (const sh of shippers ?? []) {
    const tgId = sh.telegram_id as number | null;
    if (!tgId || !bot) continue;

    const { count: urgentCountRaw } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["collecting", "problem"])
      .eq("source_warehouse", "owner")
      .eq("claimed_by", sh.id)
      .eq("send_by", today);
    const urgentCount = urgentCountRaw ?? 0;

    if (poolCount === 0 && urgentCount === 0) continue;

    const text = buildText(poolCount, urgentCount);
    try {
      await bot.api.sendMessage(tgId, text);
      console.log(
        `[shipper-pool-digest] sent to shipper ${sh.id} (pool=${poolCount}, urgent=${urgentCount})`
      );
    } catch (err) {
      console.error(`[shipper-pool-digest] DM failed for shipper ${sh.id}:`, err);
    }
  }

  await supabase
    .from("business_settings")
    .update({ last_shipper_pool_digest_date: today })
    .eq("id", settings.id);

  console.log(`[shipper-pool-digest] marked sent date = ${today}`);
}

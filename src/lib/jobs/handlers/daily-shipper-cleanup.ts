/**
 * Обработчик: daily-shipper-cleanup (cron 00:00 МСК).
 *
 * Все `collecting` без `sent` → `paid`. Отправщик взял заказ, но не сдал
 * в ПВЗ до конца дня. claimed_by, barcode_printed сбрасываются — заказ
 * возвращается в общий пул, стикер (если был напечатан) физически
 * утилизируется отправщиком.
 *
 * Срабатывает независимо от длительности работы. Заказ взят в 23:50 → если
 * до 00:00 не дошёл до sent — откатывается через 10 минут.
 *
 * Метрика is_auto_revert=true в status_history пишется здесь — Phase E
 * использует её для KPI отправщиков (§9.5).
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { appendStatusHistory } from "@/lib/orders/status-history";

function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

interface OrderToRevert {
  id: string;
  order_number: number;
  status: string;
  status_history: unknown;
  claimed_by: string | null;
}

async function revertCollectingOrders(supabase: SupabaseClient): Promise<OrderToRevert[]> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, status, status_history, claimed_by")
    .eq("status", "collecting");

  if (error) {
    console.error("[daily-shipper-cleanup] Query error:", error.message);
    return [];
  }

  if (!orders?.length) return [];

  console.log(`[daily-shipper-cleanup] Found ${orders.length} order(s) in "collecting"`);

  const reverted: OrderToRevert[] = [];

  for (const order of orders) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        claimed_by: null,
        claimed_at: null,
        barcode_printed: false,
        barcode_printed_at: null,
        status_history: appendStatusHistory(order.status_history, "paid", {
          is_auto_revert: true,
          from: "collecting",
        }),
      })
      .eq("id", order.id)
      .eq("status", "collecting"); // optimistic lock

    if (updateError) {
      console.error(
        `[daily-shipper-cleanup] Failed to revert #${order.order_number}:`,
        updateError.message
      );
      continue;
    }

    console.log(`[daily-shipper-cleanup] #${order.order_number} collecting → paid (auto)`);
    reverted.push(order);
  }

  return reverted;
}

export async function handleDailyShipperCleanup(_job: Job): Promise<void> {
  const supabase = getServiceClient();

  console.log("[daily-shipper-cleanup] Starting daily cleanup at 00:00 MSK");

  const reverted = await revertCollectingOrders(supabase);

  console.log(`[daily-shipper-cleanup] Done. Reverted: ${reverted.length} collecting`);

  if (reverted.length === 0) return;

  // DM только отправщику-исполнителю (его заказы — actionable: «возьми
  // заново»). Владельцу/директору DM НЕ шлём: сигнал «незавершённые
  // сборки» постоянно живёт в KPI карточки отправщика (§9.5 метрика 2),
  // ночной агрегат-пинг бесполезен (решение 2026-05-16, канон §4.6).
  const byShipper = new Map<string, OrderToRevert[]>();
  for (const o of reverted) {
    if (!o.claimed_by) continue;
    const arr = byShipper.get(o.claimed_by) ?? [];
    arr.push(o);
    byShipper.set(o.claimed_by, arr);
  }

  for (const [shipperId, orders] of Array.from(byShipper.entries())) {
    const list = orders.map((o: OrderToRevert) => `• №${o.order_number}`).join("\n");
    const text =
      `⚠️ Полночь МСК — авто-откат заказов\n\n` +
      `${orders.length} заказ(ов) не довели до сдачи в ПВЗ и вернулись в общий пул:\n${list}\n\n` +
      `Если планируешь работать сегодня — возьми их заново из «Общего пула».`;
    notifyShipperRaw(supabase, shipperId, text).catch((e) =>
      console.error(`[daily-shipper-cleanup] notify shipper ${shipperId} failed:`, e)
    );
  }
}

async function notifyShipperRaw(
  supabase: SupabaseClient,
  shipperId: string,
  text: string
): Promise<void> {
  const { data: user } = await supabase
    .from("users")
    .select("telegram_id")
    .eq("id", shipperId)
    .single();
  const tgId = user?.telegram_id as number | null | undefined;
  if (!tgId) return;
  try {
    const { Bot } = await import("grammy");
    const token = process.env.TELEGRAM_SHIPPER_BOT_TOKEN;
    if (!token) return;
    const bot = new Bot(token);
    await bot.api.sendMessage(tgId, text);
  } catch (err) {
    console.error("[daily-shipper-cleanup] shipper DM failed:", err);
  }
}

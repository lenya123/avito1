/**
 * Handler `partner-receipts-digest` — общий «📋 Список дел партнёра».
 * Стреляет КАЖДЫЙ ЧАС в МСК (cron `0 * * * *`); handler сам читает
 * `partner_notify_window_*` + `partner_digest_step_hours` и решает —
 * отправлять или skip.
 *
 * Канон 2026-05-26 §10.2.1: одно сообщение со всеми типами дел партнёра:
 *   • 💳 Чеки на проверке (pending_orders, ждут «N да/нет»)
 *   • 🚚 На отправку (orders.status=paid + source_warehouse='partner')
 *   • ⚠️ Забрать возврат (orders.status=return + source_warehouse='partner')
 *
 * Если всех трёх секций пусто — DM не уходит.
 */

import type { Job } from "bullmq";
import { Bot } from "grammy";
import { createServiceClient } from "@/lib/supabase/server";
import { shouldFireDigestNow, type NotifyWindow } from "@/lib/jobs/notify-window";
import type { PartnerReceiptsDigestJobData } from "../queues";
import { formatPrice } from "@/lib/telegram/utils/formatters";

let _partnerBot: Bot | null = null;
function getPartnerBot(): Bot {
  if (!_partnerBot) {
    const token = process.env.TELEGRAM_PARTNER_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_PARTNER_BOT_TOKEN not set");
    _partnerBot = new Bot(token);
  }
  return _partnerBot;
}

interface PendingRow {
  order_number: number;
  client_price: number;
  applied_balance: number | null;
  receipt_received_at: string | null;
  customer_id: string | null;
  partner_id: string;
}

interface OrderRow {
  order_number: number;
  client_price: number;
  status: string;
  source_warehouse: string | null;
  send_by: string | null;
  pickup_by: string | null;
  customer_id: string | null;
  partner_id: string;
}

export async function handlePartnerReceiptsDigest(
  _job: Job<PartnerReceiptsDigestJobData>
): Promise<void> {
  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from("business_settings")
    .select("partner_notify_window_start, partner_notify_window_end, partner_digest_step_hours")
    .limit(1)
    .maybeSingle();

  const win: NotifyWindow = {
    start: (settings?.partner_notify_window_start as string) ?? "10:00:00",
    end: (settings?.partner_notify_window_end as string) ?? "22:00:00",
  };
  const stepHours = (settings?.partner_digest_step_hours as number) ?? 3;

  if (!shouldFireDigestNow(new Date(), win, stepHours)) {
    console.log("[partner-digest] not a scheduled hour — skip");
    return;
  }

  // 1. Чеки на проверке партнёра (старая логика — pending_orders).
  const { data: pendings, error: pErr } = await supabase
    .from("pending_orders")
    .select(
      "order_number, client_price, applied_balance, receipt_received_at, customer_id, partner_id"
    )
    .not("partner_id", "is", null)
    .not("receipt_received_at", "is", null)
    .order("receipt_received_at", { ascending: true });

  if (pErr) {
    console.error("[partner-digest] pending query failed:", pErr);
    throw pErr;
  }

  // 2. Заказы на отправку у партнёра (paid + source_warehouse='partner').
  const { data: paidOrders, error: oErr } = await supabase
    .from("orders")
    .select(
      "order_number, client_price, status, source_warehouse, send_by, pickup_by, customer_id, partner_id"
    )
    .eq("status", "paid")
    .eq("source_warehouse", "partner")
    .not("partner_id", "is", null)
    .order("send_by", { ascending: true });

  if (oErr) {
    console.error("[partner-digest] paid orders query failed:", oErr);
    throw oErr;
  }

  // 3. Возвраты на забор у партнёра (return + source_warehouse='partner').
  const { data: returnOrders, error: rErr } = await supabase
    .from("orders")
    .select(
      "order_number, client_price, status, source_warehouse, send_by, pickup_by, customer_id, partner_id"
    )
    .eq("status", "return")
    .eq("source_warehouse", "partner")
    .not("partner_id", "is", null)
    .order("pickup_by", { ascending: true });

  if (rErr) {
    console.error("[partner-digest] return orders query failed:", rErr);
    throw rErr;
  }

  const pendingsByPartner = new Map<string, PendingRow[]>();
  for (const row of (pendings ?? []) as PendingRow[]) {
    if (!row.partner_id) continue;
    if (!pendingsByPartner.has(row.partner_id)) pendingsByPartner.set(row.partner_id, []);
    pendingsByPartner.get(row.partner_id)!.push(row);
  }

  const paidByPartner = new Map<string, OrderRow[]>();
  for (const row of (paidOrders ?? []) as OrderRow[]) {
    if (!row.partner_id) continue;
    if (!paidByPartner.has(row.partner_id)) paidByPartner.set(row.partner_id, []);
    paidByPartner.get(row.partner_id)!.push(row);
  }

  const returnByPartner = new Map<string, OrderRow[]>();
  for (const row of (returnOrders ?? []) as OrderRow[]) {
    if (!row.partner_id) continue;
    if (!returnByPartner.has(row.partner_id)) returnByPartner.set(row.partner_id, []);
    returnByPartner.get(row.partner_id)!.push(row);
  }

  const partnerIds = Array.from(
    new Set<string>([
      ...Array.from(pendingsByPartner.keys()),
      ...Array.from(paidByPartner.keys()),
      ...Array.from(returnByPartner.keys()),
    ])
  );

  if (partnerIds.length === 0) {
    console.log("[partner-digest] nothing to do — skip");
    return;
  }

  // Подтягиваем партнёров (tg_user_id) и юзернеймы клиентов одним запросом.
  const customerIds = [
    ...((pendings ?? []) as PendingRow[]).map((r) => r.customer_id),
    ...((paidOrders ?? []) as OrderRow[]).map((r) => r.customer_id),
    ...((returnOrders ?? []) as OrderRow[]).map((r) => r.customer_id),
  ].filter(Boolean) as string[];

  const [{ data: partners }, { data: customers }] = await Promise.all([
    supabase.from("partners").select("id, tg_user_id, is_active").in("id", partnerIds),
    customerIds.length > 0
      ? supabase.from("customers").select("id, telegram_username, name").in("id", customerIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; telegram_username: string | null; name: string | null }>,
        }),
  ]);

  const customersMap = new Map<string, string>();
  for (const c of customers ?? []) {
    customersMap.set(c.id, c.telegram_username ? `@${c.telegram_username}` : c.name || "—");
  }

  const bot = getPartnerBot();
  const now = Date.now();
  let sent = 0;

  for (const partner of partners ?? []) {
    if (!partner.tg_user_id || !partner.is_active) continue;

    const partnerPendings = pendingsByPartner.get(partner.id) ?? [];
    const partnerPaid = paidByPartner.get(partner.id) ?? [];
    const partnerReturns = returnByPartner.get(partner.id) ?? [];

    if (partnerPendings.length === 0 && partnerPaid.length === 0 && partnerReturns.length === 0) {
      continue;
    }

    const sections: string[] = [`📋 <b>Список дел партнёра</b>`, ""];

    if (partnerPendings.length > 0) {
      sections.push(`💳 <b>Чеки на проверке (${partnerPendings.length}):</b>`);
      for (const row of partnerPendings) {
        const remaining = Number(row.client_price) - Number(row.applied_balance ?? 0);
        const customerLabel = row.customer_id ? (customersMap.get(row.customer_id) ?? "—") : "—";
        const ageHours = row.receipt_received_at
          ? Math.floor((now - new Date(row.receipt_received_at).getTime()) / (60 * 60 * 1000))
          : 0;
        const ageStr = ageHours < 1 ? "только что" : `${ageHours}ч назад`;
        sections.push(
          `• №${row.order_number} — ${formatPrice(remaining)} — ${customerLabel} — чек ${ageStr}`
        );
      }
      sections.push("Ответь: <b>«&lt;номер&gt; да»</b> или <b>«&lt;номер&gt; нет»</b>.");
      sections.push("");
    }

    if (partnerPaid.length > 0) {
      sections.push(`🚚 <b>На отправку (${partnerPaid.length}):</b>`);
      for (const row of partnerPaid) {
        const customerLabel = row.customer_id ? (customersMap.get(row.customer_id) ?? "—") : "—";
        const sendBy = row.send_by ? ` · до ${formatShortDate(row.send_by)}` : "";
        sections.push(
          `• №${row.order_number} — ${formatPrice(Number(row.client_price))} — ${customerLabel}${sendBy}`
        );
      }
      sections.push("Открой «📦 Мои заказы» → карточку.");
      sections.push("");
    }

    if (partnerReturns.length > 0) {
      sections.push(`⚠️ <b>Забрать возврат (${partnerReturns.length}):</b>`);
      for (const row of partnerReturns) {
        const customerLabel = row.customer_id ? (customersMap.get(row.customer_id) ?? "—") : "—";
        const pickupBy = row.pickup_by ? ` · до ${formatShortDate(row.pickup_by)}` : "";
        sections.push(
          `• №${row.order_number} — ${formatPrice(Number(row.client_price))} — ${customerLabel}${pickupBy}`
        );
      }
      sections.push("Открой «📦 Мои заказы» → карточку.");
      sections.push("");
    }

    try {
      await bot.api.sendMessage(Number(partner.tg_user_id), sections.join("\n").trimEnd(), {
        parse_mode: "HTML",
      });
      sent++;
    } catch (e) {
      console.error(`[partner-digest] sendMessage failed for ${partner.id}:`, e);
    }
  }

  console.log(`[partner-digest] Sent digests to ${sent} partner(s)`);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

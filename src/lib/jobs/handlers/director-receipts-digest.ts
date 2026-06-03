/**
 * Handler `director-receipts-digest` — стреляет КАЖДЫЙ ЧАС в МСК
 * (cron `0 * * * *`). На каждом тике handler сам читает текущие настройки
 * `director_notify_window_*` и `director_digest_step_hours` из
 * `business_settings` и решает: отправлять или skip.
 *
 * Должные часы = `[start, start+step, start+2*step, ..., end]`. При смене
 * настроек через UI расписание применяется на следующем же тике без
 * перепланирования.
 *
 * Шлёт директору одно сводное сообщение со списком всех pending'ов,
 * у которых чек принят (`receipt_received_at NOT NULL`), но решения нет.
 *
 * 24-часовой expire per-pending живёт отдельно (`director-payment-expire`)
 * и сам сносит конкретные просроченные pending'и.
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { sendByRoute } from "@/lib/telegram/notifications";
import { shouldFireDigestNow, type NotifyWindow } from "@/lib/jobs/notify-window";
import type { DirectorReceiptsDigestJobData } from "../queues";

export async function handleDirectorReceiptsDigest(
  _job: Job<DirectorReceiptsDigestJobData>
): Promise<void> {
  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from("business_settings")
    .select("director_notify_window_start, director_notify_window_end, director_digest_step_hours")
    .limit(1)
    .maybeSingle();

  const win: NotifyWindow = {
    start: (settings?.director_notify_window_start as string) ?? "10:00:00",
    end: (settings?.director_notify_window_end as string) ?? "22:00:00",
  };
  const stepHours = (settings?.director_digest_step_hours as number) ?? 3;

  if (!shouldFireDigestNow(new Date(), win, stepHours)) {
    console.log("[director-receipts-digest] not a scheduled hour — skip");
    return;
  }

  // Все pending'и, чек по которым ушёл директору на проверку:
  // owner_warehouse (любой — без партнёра, или с партнёром но мой склад
  // → деньги мне). partner_warehouse чеки идут партнёру и в digest не входят.
  const { data: rows, error } = await supabase
    .from("pending_orders")
    .select("order_number, client_price, applied_balance, receipt_received_at, customer_id")
    .eq("source_warehouse", "owner")
    .not("receipt_received_at", "is", null)
    .order("receipt_received_at", { ascending: true });

  if (error) {
    console.error("[director-receipts-digest] query failed:", error);
    throw error;
  }

  if (!rows || rows.length === 0) {
    console.log("[director-receipts-digest] queue empty — skip");
    return;
  }

  const now = Date.now();
  const lines: string[] = [`📋 <b>Чеки на твоей проверке (${rows.length})</b>`, ""];

  // Подтянем юзернеймы клиентов одним запросом.
  const customerIds = rows.map((r) => r.customer_id).filter(Boolean) as string[];
  const customersMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, telegram_username, name")
      .in("id", customerIds);
    for (const c of customers ?? []) {
      const label = c.telegram_username ? `@${c.telegram_username}` : c.name || "—";
      customersMap.set(c.id, label);
    }
  }

  for (const row of rows) {
    const remaining = Number(row.client_price) - Number(row.applied_balance ?? 0);
    const customerLabel = row.customer_id ? (customersMap.get(row.customer_id) ?? "—") : "—";
    const ageHours = row.receipt_received_at
      ? Math.floor((now - new Date(row.receipt_received_at).getTime()) / (60 * 60 * 1000))
      : 0;
    const ageStr = ageHours < 1 ? "только что" : `${ageHours}ч назад`;
    lines.push(`• №${row.order_number} — ${remaining} ₽ — ${customerLabel} — чек ${ageStr}`);
  }

  lines.push("");
  lines.push(`Подтверждай: <b>«&lt;номер&gt; да»</b> или <b>«&lt;номер&gt; нет»</b>.`);

  await sendByRoute({
    routeKey: "receipt_review",
    message: lines.join("\n"),
  });

  console.log(`[director-receipts-digest] Sent digest with ${rows.length} pending(s)`);
}

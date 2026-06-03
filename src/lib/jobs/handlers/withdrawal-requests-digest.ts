/**
 * Handler `withdrawal-requests-digest` — стреляет КАЖДЫЙ ЧАС в МСК
 * (cron `0 * * * *`). На каждом тике handler сам читает текущее окно и step
 * из `business_settings` (reuse `director_notify_window_*` /
 * `director_digest_step_hours` — это «back-office hours», совместимо с
 * проверкой чеков директором). Решает: отправлять или skip.
 *
 * Должные часы = `[start, start+step, start+2*step, ..., end]`. При смене
 * настроек через UI расписание применяется на следующем же тике без
 * перепланирования.
 *
 * Шлёт по routeKey `withdrawal_request` (по умолчанию владельцу) одно
 * сводное сообщение со списком всех pending withdrawal_requests, чтобы
 * запросы не зависали в ленте Telegram. Если pending'ов нет — skip.
 *
 * Парсер «N да/нет» — в owner-bot, общий с DM-уведомлением.
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { sendByRoute } from "@/lib/telegram/notifications";
import { shouldFireDigestNow, type NotifyWindow } from "@/lib/jobs/notify-window";
import type { WithdrawalRequestsDigestJobData } from "../queues";

function formatPrice(p: number): string {
  return `${Number(p).toLocaleString("ru-RU")} ₽`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function handleWithdrawalRequestsDigest(
  _job: Job<WithdrawalRequestsDigestJobData>
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
    console.log("[withdrawal-requests-digest] not a scheduled hour — skip");
    return;
  }

  const { data: rows, error } = await supabase
    .from("withdrawal_requests")
    .select("withdrawal_number, amount, customer_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[withdrawal-requests-digest] query failed:", error);
    throw error;
  }

  if (!rows || rows.length === 0) {
    console.log("[withdrawal-requests-digest] no pending — skip");
    return;
  }

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

  const now = Date.now();
  const lines: string[] = [`💸 <b>Запросы на вывод (${rows.length})</b>`, ""];

  for (const row of rows) {
    const num = row.withdrawal_number;
    const amount = Number(row.amount);
    const customerLabel = row.customer_id ? (customersMap.get(row.customer_id) ?? "—") : "—";
    const ageHours = row.created_at
      ? Math.floor((now - new Date(row.created_at).getTime()) / (60 * 60 * 1000))
      : 0;
    const ageStr = ageHours < 1 ? "только что" : `${ageHours}ч назад`;
    lines.push(`• #${num} — ${escapeHtml(customerLabel)} — ${formatPrice(amount)} — ${ageStr}`);
  }

  lines.push("");
  lines.push(
    `Закрыть: <b>«&lt;номер&gt; да»</b>. Отказать с возвратом баланса: <b>«&lt;номер&gt; нет»</b>.`
  );

  await sendByRoute({
    routeKey: "withdrawal_request",
    message: lines.join("\n"),
  });

  console.log(`[withdrawal-requests-digest] sent digest with ${rows.length} pending(s)`);
}

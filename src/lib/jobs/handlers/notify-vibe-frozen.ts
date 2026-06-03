/**
 * Обработчик: notify-vibe-frozen / notify-vibe-unfrozen.
 *
 * BUSINESS_LOGIC.md §7.3: при автозаморозке/разморозке +ВАЙБ-клиента нужно
 * послать DM в customer-bot. Триггер `check_vibe_credit_freeze` обновляет
 * customers.is_frozen, а отдельный wiring (Phase F) ставит этот job в очередь.
 *
 * Pattern: явный enqueue из places-of-update (после INSERT/UPDATE на vibe_payments,
 * orders, customers.is_frozen вручную) — а не listening на postgres NOTIFY.
 * Так проще тестировать и не плодим инфраструктуру.
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { notifyCustomerVibeFrozen, notifyCustomerVibeUnfrozen } from "@/lib/telegram/notifications";

export interface NotifyVibeFrozenJobData {
  customerId: string;
  /** true — клиент только что заморожен; false — только что разморожен. */
  isFrozen: boolean;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function handleNotifyVibeFrozen(job: Job<NotifyVibeFrozenJobData>): Promise<void> {
  const { customerId, isFrozen } = job.data;
  const supabase = getServiceClient();

  console.log(`[notify-vibe-frozen] Customer ${customerId} → ${isFrozen ? "FROZEN" : "UNFROZEN"}`);

  // Проверяем актуальное состояние — за время задержки могло измениться.
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, is_frozen, required_payment_amount")
    .eq("id", customerId)
    .single();

  if (error || !customer) {
    console.error(`[notify-vibe-frozen] Customer ${customerId} not found:`, error);
    return;
  }

  if (customer.is_frozen !== isFrozen) {
    console.log(
      `[notify-vibe-frozen] State drift for ${customerId} (job=${isFrozen}, db=${customer.is_frozen}) — skipping`
    );
    return;
  }

  // Текущий долг (одна выборка для обеих веток — frozen и unfrozen).
  const { data: debtRow } = await supabase
    .from("customer_vibe_debt")
    .select("debt")
    .eq("customer_id", customerId)
    .maybeSingle();
  const debt = Number(debtRow?.debt ?? 0);

  if (isFrozen) {
    const required = customer.required_payment_amount
      ? Number(customer.required_payment_amount)
      : null;
    await notifyCustomerVibeFrozen({ customerId, debt, required });
  } else {
    // Auto-path: триггер БД сработал → cause='auto'.
    // Ручная разморозка из owner-panel шлёт DM напрямую, минуя этот job.
    await notifyCustomerVibeUnfrozen({ customerId, cause: "auto", debt });
  }
}

/**
 * Обработчик: возврат → trash после истечения pickup_by.
 *
 * Триггерится из `expire-pickup-by` job (Phase C). Сам по себе никогда
 * не планируется — только вызывается после проверки в expire-pickup-by.
 *
 * BUSINESS_LOGIC.md §6.5:
 *   1. Заказ → trash.
 *   2. Определяется fault_party + fault_reason.
 *   3. Деньги клиенту НЕ возвращаются автоматически.
 *   4. Уведомления: клиенту (DM, «возврат в утиле»), владельцу,
 *      отправщику (если fault_party=platform / no_attempts).
 *
 * Адаптивные пороги попыток (§6.6) определяют fault.
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { MoveToTrashJobData } from "../queues";
import { appendStatusHistory } from "@/lib/orders/status-history";
import {
  notifyCustomerOrderTrashed,
  notifyOwnerTrashedPlatformFault,
} from "@/lib/telegram/notifications";
import { resolvePartnerRefundContext } from "@/lib/orders/partner-refund-context";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

type FaultParty = "platform" | "client";
type FaultReason = "no_attempts" | "wrong_data" | "no_response" | "late_report";

/**
 * Адаптивные пороги попыток забора возврата (BUSINESS_LOGIC §6.6).
 * Окно = pickup_by - дата_оформления_возврата (в днях).
 */
function requiredAttempts(windowDays: number): number {
  if (windowDays >= 9) return 3;
  if (windowDays >= 6) return 2;
  if (windowDays >= 3) return 1;
  return 0;
}

export async function handleMoveToTrash(job: Job<MoveToTrashJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[move-to-trash] Processing order ${orderId}`);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, status_history, return_window_days, order_number, customer_id, partner_id, source_warehouse, is_paid, client_price"
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error(`[move-to-trash] Order ${orderId} not found:`, orderError);
    return;
  }

  // Только return → trash. Если статус уже изменился (return_done/cancelled) — выходим.
  if (order.status !== "return") {
    console.log(
      `[move-to-trash] Order ${orderId} status="${order.status}" — already past return, skipping`
    );
    return;
  }

  // Партнёрский с самоотгрузкой (source_warehouse='partner') — нейтральный утиль без fault_party.
  // Канон §6.5 (2026-05-26): если партнёр сам отгружает и сам забирает
  // возврат, а в нашей системе не было «попыток» (мы их не фиксируем у
  // партнёра — это его работа), то метить «вину платформы» — заведомо
  // ложно. Просто статус trash без ярлыка вины; клиенту инструкция
  // обсуждать с партнёром напрямую.
  const isPartnerSelfFulfilled = !!order.partner_id && order.source_warehouse === "partner";

  if (isPartnerSelfFulfilled) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "trash",
        fault_party: null,
        fault_reason: null,
        status_history: appendStatusHistory(order.status_history, "trash"),
      })
      .eq("id", orderId);

    if (updateError) {
      console.error(`[move-to-trash] Failed to update partner order ${orderId}:`, updateError);
      throw updateError;
    }

    console.log(
      `[move-to-trash] Partner-warehouse order ${orderId} → trash (no fault — partner self-fulfilled)`
    );

    if (order.customer_id) {
      const ctx = await resolvePartnerRefundContext(
        supabase,
        order.partner_id as string,
        order.customer_id as string
      );
      notifyCustomerOrderTrashed({
        customerId: order.customer_id as string,
        orderId: order.id as string,
        orderNumber: order.order_number as number,
        faultParty: null,
        faultReason: null,
        partnerRefund: ctx ? { partnerLabel: ctx.partnerLabel } : undefined,
      }).catch((e) => console.error("[move-to-trash] notifyCustomerOrderTrashed failed:", e));
    }
    return;
  }

  // Считаем фактические попытки забора (уникальные дни).
  const { data: attempts } = await supabase
    .from("return_pickup_attempts")
    .select("attempt_date, result")
    .eq("order_id", orderId);

  const attemptCount = attempts?.length ?? 0;
  const windowDays = order.return_window_days ?? 0;
  const required = requiredAttempts(windowDays);

  let fault_party: FaultParty;
  let fault_reason: FaultReason;

  if (windowDays <= 2) {
    fault_party = "client";
    fault_reason = "late_report";
  } else if (attemptCount < required) {
    fault_party = "platform";
    fault_reason = "no_attempts";
  } else {
    fault_party = "client";
    const hasWrongData = (attempts ?? []).some((a) =>
      ["wrong_code", "wrong_tracking", "not_found"].includes(a.result ?? "")
    );
    fault_reason = hasWrongData ? "wrong_data" : "no_response";
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "trash",
      fault_party,
      fault_reason,
      status_history: appendStatusHistory(order.status_history, "trash"),
    })
    .eq("id", orderId);

  if (updateError) {
    console.error(`[move-to-trash] Failed to update order ${orderId}:`, updateError);
    throw updateError;
  }

  console.log(
    `[move-to-trash] Order ${orderId} → trash, fault: ${fault_party}/${fault_reason} (window=${windowDays}d, attempts=${attemptCount}/${required})`
  );

  // Для партнёрских с нашим складом (source_warehouse='owner') — подгружаем контакты партнёра.
  let partnerLabel: string | undefined;
  let customerLabel = "клиент";
  if (order.partner_id && order.customer_id) {
    const ctx = await resolvePartnerRefundContext(
      supabase,
      order.partner_id as string,
      order.customer_id as string
    );
    if (ctx) {
      partnerLabel = ctx.partnerLabel;
      customerLabel = ctx.customerLabel;
    }
  }

  if (order.customer_id) {
    notifyCustomerOrderTrashed({
      customerId: order.customer_id as string,
      orderId: order.id as string,
      orderNumber: order.order_number as number,
      faultParty: fault_party,
      faultReason: fault_reason,
      partnerRefund: partnerLabel ? { partnerLabel } : undefined,
    }).catch((e) => console.error("[move-to-trash] notifyCustomerOrderTrashed failed:", e));
  }

  // DM владельцу/директору только при platform-fault на owner-source.
  // Партнёрские с platform-fault — owner не вернёт деньги (они у партнёра),
  // эскалация — забота партнёра. Owner-source: владельцу надо вернуть.
  if (
    fault_party === "platform" &&
    !order.partner_id &&
    order.is_paid &&
    (order.client_price as number) > 0 &&
    order.customer_id
  ) {
    // Подгрузим customer_label для DM владельцу.
    const { data: customer } = await supabase
      .from("customers")
      .select("name, telegram_username")
      .eq("id", order.customer_id)
      .maybeSingle();
    const ownerCustomerLabel = customer?.telegram_username
      ? `@${(customer.telegram_username as string).replace(/^@/, "")}`
      : ((customer?.name as string) ?? customerLabel);
    notifyOwnerTrashedPlatformFault({
      orderNumber: order.order_number as number,
      orderId: order.id as string,
      amount: order.client_price as number,
      customerLabel: ownerCustomerLabel,
      faultReason: fault_reason,
    }).catch((e) => console.error("[move-to-trash] notifyOwnerTrashedPlatformFault failed:", e));
  }
}

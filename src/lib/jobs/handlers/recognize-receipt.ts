/**
 * BullMQ handler `recognize-receipt` (Stage 3.5).
 *
 * Скачивает чек из bucket `receipts`, прогоняет через OpenAI Vision,
 * создаёт vibe_payments (+ vibe_payment_orders). Если выполнены условия
 * auto-confirm (сумма совпадает, дата чека >= момента запроса) — сразу
 * confirmed_at=NOW + помечает покрытые orders.is_paid=TRUE. Иначе —
 * confirmed_at=NULL, ждём владельца.
 *
 * `route='partner'` обработка добавляется в Phase 3.9 (там partner-bot
 * подтверждает получение средств вручную; здесь мы для partner-маршрута
 * лишь создаём незакрытый vibe_payments-стаб для аудита).
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { recognizeReceipt } from "@/lib/ai/receipt-vision";
import {
  notifyCustomerVibePaymentConfirmed,
  notifyCustomerVibePaymentNeedsReview,
  notifyCustomerVibePaymentReplay,
  notifyOwnerReceiptReceived,
  notifyOwnerSecurityAlert,
} from "@/lib/telegram/notifications";
import type { RecognizeReceiptJobData } from "../queues";
import type { Json } from "@/types/database.generated";
import { formatPrice } from "@/lib/telegram/utils/formatters";

const SIGNED_URL_TTL_SECONDS = 60 * 5;
const AMOUNT_TOLERANCE_RUB = 1;

export async function handleRecognizeReceipt(job: Job<RecognizeReceiptJobData>): Promise<void> {
  const data = job.data;
  console.log(
    `[recognize-receipt] customer=${data.customerId} orders=${data.orderIds.length} amount=${data.amountExpected} route=${data.route}`
  );

  const supabase = createServiceClient();

  // route='partner': Vision не нужен (партнёр сам проверит). Просто создаём
  // vibe_payment-стаб + vibe_payment_orders и пересылаем чек партнёру.
  if (data.route === "partner") {
    await handlePartnerRouteReceipt(data, supabase);
    return;
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from("receipts")
    .createSignedUrl(data.filePath, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    console.error("[recognize-receipt] signed URL failed:", signedError);
    throw signedError ?? new Error("signed URL missing");
  }

  let visionResult: Awaited<ReturnType<typeof recognizeReceipt>> | null = null;
  try {
    visionResult = await recognizeReceipt(signed.signedUrl);
  } catch (error) {
    console.error("[recognize-receipt] Vision call failed:", error);
  }

  const operationId = visionResult?.operationId ?? null;

  // Anti-replay (канон §8.1): operation_id уникален в едином namespace
  // orders.vision_operation_id + vibe_payments.operation_id. Один и тот
  // же чек нельзя провести повторно — иначе +ВАЙБ-долг гасится дважды
  // при поступлении денег один раз. На повтор: НЕ создаём vibe_payment
  // и НЕ трогаем is_paid (как order-flow при replay не создаёт заказ);
  // клиенту — терминальный отказ, владельцу — алерт, факт в activity_log.
  if (operationId) {
    const { data: orderHit } = await supabase
      .from("orders")
      .select("order_number")
      .eq("vision_operation_id", operationId)
      .limit(1)
      .maybeSingle();
    let usedFor: string | null = orderHit ? `заказ №${orderHit.order_number}` : null;
    if (!usedFor) {
      const { data: vibeHit } = await supabase
        .from("vibe_payments")
        .select("id")
        .eq("operation_id", operationId)
        .limit(1)
        .maybeSingle();
      if (vibeHit) usedFor = "ранее погашённый долг";
    }
    if (usedFor) {
      console.warn(
        `[recognize-receipt] anti-replay: operation_id=${operationId} уже использован (${usedFor}), customer=${data.customerId}`
      );
      await supabase.from("activity_log").insert({
        action: "vibe_payment_replay_rejected",
        entity_type: "vibe_payment",
        details: {
          operation_id: operationId,
          customer_id: data.customerId,
          order_ids: data.orderIds,
          used_for: usedFor,
        },
      });
      // Запись в fraud_alerts — для постфактум-ревью на /owner/security
      // (тип `vibe_replay` добавлен в CHECK 2026-05-21).
      await supabase
        .from("fraud_alerts")
        .insert({
          customer_id: data.customerId,
          alert_type: "vibe_replay",
          severity: "high",
          status: "open",
          details: {
            operation_id: operationId,
            used_for: usedFor,
            order_ids: data.orderIds,
          },
        })
        .then(({ error }) => {
          if (error) console.error("[recognize-receipt] fraud_alerts insert failed:", error);
        });
      notifyCustomerVibePaymentReplay({ customerId: data.customerId }).catch((e) =>
        console.error("notifyCustomerVibePaymentReplay failed:", e)
      );
      notifyOwnerSecurityAlert({ alertType: "vibe_replay", severity: "high" }).catch((e) =>
        console.error("notifyOwnerSecurityAlert (vibe_replay) failed:", e)
      );
      return;
    }
  }

  const expectedSince = new Date(data.expectedSinceIso);
  const amountMatches =
    typeof visionResult?.transferredAmount === "number" &&
    Math.abs(visionResult.transferredAmount - data.amountExpected) <= AMOUNT_TOLERANCE_RUB;
  const dateOk = visionResult?.transferDatetime
    ? visionResult.transferDatetime.getTime() >= expectedSince.getTime() - 60_000
    : false;
  const autoConfirm = data.route === "owner" && amountMatches && dateOk;

  // Запись vibe_payments всегда — для аудита и владельца.
  const rawResponseJson: Json | null = visionResult?.rawResponse
    ? (JSON.parse(JSON.stringify(visionResult.rawResponse)) as Json)
    : null;

  const { data: payment, error: paymentError } = await supabase
    .from("vibe_payments")
    .insert({
      customer_id: data.customerId,
      amount: visionResult?.transferredAmount ?? data.amountExpected,
      receipt_file_url: data.filePath,
      receipt_recognized_text: visionResult?.rawText ?? null,
      receipt_raw_response: rawResponseJson,
      payment_method_id: data.paymentMethodId,
      operation_id: operationId,
      confirmed_at: autoConfirm ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (paymentError || !payment) {
    console.error("[recognize-receipt] vibe_payments insert failed:", paymentError);
    throw paymentError ?? new Error("vibe_payments insert failed");
  }

  if (data.orderIds.length > 0) {
    const links = data.orderIds.map((orderId) => ({
      vibe_payment_id: payment.id,
      order_id: orderId,
    }));
    const { error: linkError } = await supabase.from("vibe_payment_orders").insert(links);
    if (linkError) {
      console.error("[recognize-receipt] vibe_payment_orders insert failed:", linkError);
    }
  }

  if (autoConfirm && data.orderIds.length > 0) {
    // Снимок is_frozen ДО is_paid=true — погашение долга может разморозить.
    const { data: cust } = await supabase
      .from("customers")
      .select("is_frozen")
      .eq("id", data.customerId)
      .maybeSingle();
    const wasFrozen = !!cust?.is_frozen;

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: "deposit",
      })
      .in("id", data.orderIds);
    if (orderUpdateError) {
      console.error("[recognize-receipt] orders update failed:", orderUpdateError);
    } else {
      const { maybeNotifyFrozenChange } = await import("@/lib/telegram/notifications");
      maybeNotifyFrozenChange(data.customerId, wasFrozen).catch((e) =>
        console.error("maybeNotifyFrozenChange (vibe-payment) failed:", e)
      );
    }
  }

  // Получаем имя клиента для уведомления владельцу.
  const { data: customer } = await supabase
    .from("customers")
    .select("name, telegram_username")
    .eq("id", data.customerId)
    .maybeSingle();

  if (autoConfirm) {
    notifyCustomerVibePaymentConfirmed({
      customerId: data.customerId,
      amount: data.amountExpected,
    }).catch((e) => console.error("notifyCustomerVibePaymentConfirmed failed:", e));
  } else {
    notifyCustomerVibePaymentNeedsReview({
      customerId: data.customerId,
    }).catch((e) => console.error("notifyCustomerVibePaymentNeedsReview failed:", e));
  }

  // Алерт владельцу — auto-confirmed или требует проверки.
  notifyOwnerReceiptReceived({
    orderNumber: 0,
    clientPrice: visionResult?.transferredAmount ?? data.amountExpected,
    customerName: customer?.name ?? null,
    customerUsername: customer?.telegram_username ?? null,
  }).catch((e) => console.error("notifyOwnerReceiptReceived failed:", e));

  console.log(
    `[recognize-receipt] done payment=${payment.id} auto=${autoConfirm} amount_recognized=${visionResult?.transferredAmount ?? "—"}`
  );
}

/**
 * Обработка чека для партнёрского +ВАЙБ-долга. Без Vision: создаём
 * vibe_payment + связи с заказами, скачиваем фото из Storage и пересылаем
 * партнёру с inline-кнопками «✅ Получил» / «❌ Не пришли».
 */
async function handlePartnerRouteReceipt(
  data: RecognizeReceiptJobData,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  if (!data.partnerId) {
    console.error("[recognize-receipt:partner] partnerId missing");
    return;
  }

  const { data: payment, error: paymentError } = await supabase
    .from("vibe_payments")
    .insert({
      customer_id: data.customerId,
      amount: data.amountExpected,
      receipt_file_url: data.filePath,
      payment_method_id: null,
      confirmed_at: null,
    })
    .select("id")
    .single();

  if (paymentError || !payment) {
    console.error("[recognize-receipt:partner] vibe_payments insert failed:", paymentError);
    throw paymentError ?? new Error("vibe_payments insert failed");
  }

  if (data.orderIds.length > 0) {
    const links = data.orderIds.map((orderId) => ({
      vibe_payment_id: payment.id,
      order_id: orderId,
    }));
    const { error: linkError } = await supabase.from("vibe_payment_orders").insert(links);
    if (linkError) {
      console.error("[recognize-receipt:partner] vibe_payment_orders insert failed:", linkError);
    }
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("order_number, client_price, products(name)")
    .in("id", data.orderIds);

  const { data: customer } = await supabase
    .from("customers")
    .select("name, telegram_username")
    .eq("id", data.customerId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersList = (orders ?? []) as any[];
  const orderLines = ordersList
    .map(
      (o) =>
        `№${o.order_number} · ${o.products?.name ?? ""} · ${formatPrice(Number(o.client_price))}`
    )
    .join("\n");

  const clientLabel = customer?.telegram_username
    ? `@${customer.telegram_username}`
    : (customer?.name ?? "клиент");

  // Канон: единичный заказ — текстом «N да/нет» (как обычная партнёрская оплата);
  // группа — кнопками. Унификация с partner-confirm flow.
  const isSingleOrder = ordersList.length === 1;
  const singleOrderNumber = isSingleOrder ? Number(ordersList[0].order_number) : null;

  const tailLine = isSingleOrder
    ? `Получил деньги? Ответь текстом: <b>«${singleOrderNumber} да»</b> или <b>«${singleOrderNumber} нет»</b>.`
    : `Получил деньги? Подтверди — все заказы в группе закроются одним нажатием.`;

  const caption =
    `🤝 Оплата +ВАЙБ-долга от ${clientLabel}\n\n` +
    `<b>Сумма: ${formatPrice(data.amountExpected)}</b>\n\n` +
    `Заказы:\n${orderLines}\n\n` +
    tailLine;

  // Скачиваем фото чека и шлём партнёру через partner-bot.
  const { sendVibeDebtReceiptToPartner } = await import("@/lib/telegram/notifications");
  await sendVibeDebtReceiptToPartner({
    partnerId: data.partnerId,
    storagePath: data.filePath,
    caption,
    paymentId: payment.id,
    useTextFlow: isSingleOrder,
  }).catch((e) => console.error("sendVibeDebtReceiptToPartner failed:", e));

  console.log(
    `[recognize-receipt:partner] payment=${payment.id} forwarded to partner ${data.partnerId}, orders=${data.orderIds.length}`
  );
}

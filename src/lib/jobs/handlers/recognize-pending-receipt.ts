/**
 * BullMQ handler `recognize-pending-receipt` — Vision auto-confirm для
 * одиночных не-+ВАЙБ заказов (§4.1 → 🅐, walkthrough Этап 4).
 *
 * Запускается из `handlePendingReceiptPhoto` после загрузки чека в Storage.
 * Делает 4 проверки (см. lib/payments/match-receipt.ts):
 *   1. anti-replay по operation_id
 *   2. сумма >= ожидаемая − 1 ₽
 *   3. дата чека свежая
 *   4. жёсткое совпадение получателя с одним из активных payment_methods
 *
 * Все 4 = pass И is_proper_receipt И переплата ≤ 300 ₽
 *   → confirm_pending_order_atomic + (если переплата) apply_overpayment.
 * Иначе:
 *   - is_proper_receipt = false и attempts < 1 → DM клиенту с просьбой
 *     прислать настоящий чек (inline-кнопкой «📤 Отправить чек повторно»),
 *     receipt_attempts++; receipt_received_at сбрасываем; таймер 10 мин
 *     перезапускаем.
 *   - Иначе → notifyDirectorPendingReceiptForReview с детализацией всех
 *     4 проверок.
 *
 * Партнёрские pending под Vision auto-confirm НЕ попадают — для них
 * подтверждение даёт партнёр в своём боте (handlePendingReceiptPhoto
 * не запускает этот job для partner orders).
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { recognizeReceipt } from "@/lib/ai/receipt-vision";
import {
  notifyCustomerOrderApproved,
  notifyDirectorPendingReceiptForReview,
  notifyDirectorReplaySuspicion,
} from "@/lib/telegram/notifications";
import { upsertOrderSummary, buildSummaryFromOrderId } from "@/lib/telegram/orders-group";
import { runFourChecks, formatChecksForDirector } from "@/lib/payments/match-receipt";
import { getCustomerBotForNotifications } from "@/lib/telegram/notifications";
import type { RecognizePendingReceiptJobData } from "../queues";

const SIGNED_URL_TTL_SECONDS = 60 * 5;
const OVERPAYMENT_AUTO_CAP = 300; // ₽

export async function handleRecognizePendingReceipt(
  job: Job<RecognizePendingReceiptJobData>
): Promise<void> {
  const { pendingOrderId, filePath, expectedAmount } = job.data;
  const supabase = createServiceClient();

  console.log(`[recognize-pending-receipt] pending=${pendingOrderId} expected=${expectedAmount}`);

  const { data: pending } = await supabase
    .from("pending_orders")
    .select(
      "id, customer_id, order_number, client_price, applied_balance, partner_id, created_at, receipt_attempts"
    )
    .eq("id", pendingOrderId)
    .maybeSingle();

  if (!pending) {
    console.log(`[recognize-pending-receipt] pending ${pendingOrderId} already gone, skip`);
    return;
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from("receipts")
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    console.error("[recognize-pending-receipt] signed URL failed:", signedError);
    throw signedError ?? new Error("signed URL missing");
  }

  let visionResult: Awaited<ReturnType<typeof recognizeReceipt>> | null = null;
  try {
    visionResult = await recognizeReceipt(signed.signedUrl);
  } catch (error) {
    console.error("[recognize-pending-receipt] Vision call failed:", error);
  }
  if (!visionResult) {
    // Технический сбой на нашей стороне (OpenAI API недоступен / упал).
    // Не баг клиента — отдаём директору на ручную проверку.
    await sendDirectorReview(supabase, pending, filePath, null, {
      hint: "Технический сбой Vision (API недоступен). Проверь чек глазами.",
    });
    return;
  }

  // Сохраняем Vision-поля в pending (для аудита, для копирования в orders).
  await supabase
    .from("pending_orders")
    .update({
      vision_operation_id: visionResult.operationId,
      vision_recipient_card_last4: visionResult.recipientCardLast4,
      vision_recipient_phone: visionResult.recipientPhone,
      vision_recipient_ip_name: visionResult.recipientIpName,
      vision_recipient_name: visionResult.recipientName,
      vision_recipient_bank: visionResult.recipientBank,
      vision_amount: visionResult.transferredAmount,
      vision_datetime: visionResult.transferDatetime?.toISOString() ?? null,
      vision_is_proper_receipt: visionResult.isProperReceipt,
      vision_raw_text: visionResult.rawText,
    })
    .eq("id", pendingOrderId);

  // Ожидаемая сумма = остаток после применения баланса при оформлении.
  const remainingExpected = Math.max(
    0,
    Number(pending.client_price) - Number(pending.applied_balance ?? 0)
  );

  const attempts = Number(pending.receipt_attempts ?? 0);

  // 4 проверки.
  const checks = await runFourChecks(supabase, {
    vision: visionResult,
    expectedAmount: remainingExpected,
    pendingCreatedAt: new Date(pending.created_at),
  });

  const overpayment =
    visionResult.transferredAmount != null
      ? Math.max(0, visionResult.transferredAmount - remainingExpected)
      : 0;
  const overpaymentTooBig = overpayment > OVERPAYMENT_AUTO_CAP;

  const allPass = !!checks?.allPass && !overpaymentTooBig;

  if (!allPass) {
    const isReplay =
      !checks.replay.pass && checks.replay.reason.startsWith("этот чек уже использован");

    // 1-я попытка: понятный текст клиенту по конкретной причине провала.
    //   - Replay → терминальный текст «чек уже использован для заказа №X».
    //   - Сумма/получатель/дата/нечитаемый → конкретная подсказка + PDF.
    // 2-я попытка (любой природы): эскалация директору с детализацией.
    //   Replay тоже идёт к директору, потому что Vision мог ошибиться с
    //   operation_id — пусть глаза глянут.
    if (attempts < 1) {
      if (isReplay) {
        await sendReplayWarningToClient(supabase, pending, checks.replay.reason);
      } else {
        await retryReceipt(supabase, pending, checks, visionResult);
      }
      return;
    }

    // 2-я попытка с replay → отдельный helper с двумя чеками для сравнения.
    if (isReplay && visionResult?.operationId) {
      await sendReplayDirectorReview(supabase, pending, filePath, visionResult);
      return;
    }

    // 2-я попытка остальных провалов (сумма/получатель/дата/нечитаемый чек) →
    // обычная эскалация директору с детализацией.
    const hintParts: string[] = [];
    if (overpaymentTooBig) {
      hintParts.push(
        `переплата ${overpayment} ₽ превышает потолок ${OVERPAYMENT_AUTO_CAP} ₽ для авто-подтверждения`
      );
    }
    await sendDirectorReview(supabase, pending, filePath, visionResult, {
      checks: formatChecksForDirector(checks),
      hint: hintParts.length > 0 ? hintParts.join("; ") : undefined,
    });
    return;
  }

  // Снимок is_frozen ДО confirm/overpayment — для DM при заморозке/разморозке.
  let wasFrozen: boolean | null = null;
  if (pending.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("is_frozen")
      .eq("id", pending.customer_id)
      .maybeSingle();
    wasFrozen = !!cust?.is_frozen;
  }

  // Все проверки ОК → confirm + (если переплата) apply_overpayment_atomic.
  const { data: orderIdRaw, error: confirmError } = await supabase
    .rpc("confirm_pending_order_atomic", {
      p_pending_order_id: pendingOrderId,
      p_payment_method: "card",
      p_confirmed_by: "vision",
    })
    .single();

  if (confirmError) {
    console.error("[recognize-pending-receipt] confirm_pending_order_atomic failed:", confirmError);
    throw confirmError;
  }
  if (!orderIdRaw) {
    console.log(`[recognize-pending-receipt] confirm returned null — pending уже снят`);
    return;
  }

  const orderId = orderIdRaw as unknown as string;

  if (overpayment > 0 && pending.customer_id) {
    await supabase
      .rpc("apply_overpayment_atomic", {
        p_customer_id: pending.customer_id,
        p_amount: overpayment,
        p_order_id: orderId,
      })
      .single();
  }

  if (pending.customer_id) {
    notifyCustomerOrderApproved({
      customerId: pending.customer_id,
      orderId,
      orderNumber: pending.order_number,
    }).catch((e) => console.error("notifyCustomerOrderApproved failed:", e));

    const { maybeNotifyFrozenChange } = await import("@/lib/telegram/notifications");
    maybeNotifyFrozenChange(pending.customer_id, wasFrozen).catch((e) =>
      console.error("maybeNotifyFrozenChange (vision-confirm) failed:", e)
    );
  }

  buildSummaryFromOrderId(orderId)
    .then((summary) => (summary ? upsertOrderSummary(summary) : undefined))
    .catch((e) => console.error("upsertOrderSummary (pending vision) failed:", e));

  console.log(
    `[recognize-pending-receipt] auto-confirmed pending=${pendingOrderId} → order=${orderId}` +
      (overpayment > 0 ? ` (overpayment ${overpayment} ₽ → balance/debt)` : "")
  );
}

// =====================================================================
// Helpers
// =====================================================================

type PendingForReview = {
  id: string;
  customer_id: string | null;
  order_number: number;
  client_price: number | string;
  partner_id: string | null;
  created_at: string;
  receipt_attempts?: number | null;
};

/** Сбрасываем чек, увеличиваем attempts, перезапускаем 10-мин таймер,
 *  шлём DM с конкретной причиной провала. Без inline-кнопки: session
 *  активна (см. фикс customer-bot.ts handlePendingReceiptPhoto), клиент
 *  может прислать новый чек обычным сообщением. */
async function retryReceipt(
  supabase: ReturnType<typeof createServiceClient>,
  pending: PendingForReview,
  checks: import("@/lib/payments/match-receipt").FourCheckResult,
  visionResult: Awaited<ReturnType<typeof recognizeReceipt>> | null
) {
  const newAttempts = Number(pending.receipt_attempts ?? 0) + 1;
  await supabase
    .from("pending_orders")
    .update({
      receipt_attempts: newAttempts,
      receipt_received_at: null,
      receipt_storage_path: null,
      receipt_file_id: null,
    })
    .eq("id", pending.id);

  const { scheduleExpirePendingOrder } = await import("@/lib/jobs/queues");
  scheduleExpirePendingOrder(pending.id, 10).catch((err) =>
    console.error("[retryReceipt] scheduleExpirePendingOrder failed:", err)
  );

  if (!pending.customer_id) return;

  const { data: customer } = await supabase
    .from("customers")
    .select("tg_user_id")
    .eq("id", pending.customer_id)
    .maybeSingle();
  if (!customer?.tg_user_id) return;

  const { getDirectorPersonalHandle } = await import("@/lib/telegram/notifications");
  const handle = await getDirectorPersonalHandle();
  const messageBody = buildRetryMessage(checks, visionResult, pending.order_number, handle);

  try {
    const bot = getCustomerBotForNotifications();
    await bot.api.sendMessage(Number(customer.tg_user_id), messageBody);
  } catch (e) {
    console.error("[retryReceipt] DM failed:", e);
  }
}

/** Anti-replay 1-я попытка: терминальный отказ клиенту с понятным текстом.
 *  Attempts инкрементим — на 2-й попытке (любой природы) уйдёт к директору. */
async function sendReplayWarningToClient(
  supabase: ReturnType<typeof createServiceClient>,
  pending: PendingForReview,
  reason: string
) {
  if (!pending.customer_id) return;

  const newAttempts = Number(pending.receipt_attempts ?? 0) + 1;
  await supabase
    .from("pending_orders")
    .update({
      receipt_attempts: newAttempts,
      receipt_received_at: null,
      receipt_storage_path: null,
      receipt_file_id: null,
    })
    .eq("id", pending.id);

  const { scheduleExpirePendingOrder } = await import("@/lib/jobs/queues");
  scheduleExpirePendingOrder(pending.id, 10).catch((err) =>
    console.error("[sendReplayWarningToClient] scheduleExpirePendingOrder failed:", err)
  );

  const { data: customer } = await supabase
    .from("customers")
    .select("tg_user_id")
    .eq("id", pending.customer_id)
    .maybeSingle();
  if (!customer?.tg_user_id) return;

  const { getDirectorPersonalHandle } = await import("@/lib/telegram/notifications");
  const handle = await getDirectorPersonalHandle();
  const directorLine = handle
    ? `\n\nЕсли ты уверен, что перевод реально прошёл — напиши ${handle}, разберёмся.`
    : "";

  const messageBody =
    `⚠️ ${capitalizeFirst(reason)}.\n\n` +
    `Если ты ошибся — сделай новый перевод и пришли свежий чек.${directorLine}\n\n` +
    `Заказ №${pending.order_number} ждёт оплаты.`;

  try {
    const bot = getCustomerBotForNotifications();
    await bot.api.sendMessage(Number(customer.tg_user_id), messageBody);
  } catch (e) {
    console.error("[sendReplayWarningToClient] DM failed:", e);
  }
}

/** Подбирает текст ошибки клиенту по конкретной упавшей проверке.
 *  Для веток где Vision что-то распознал, но проверка не совпала
 *  (сумма / получатель / устаревшая дата / replay) — добавляем фолбэк-строку
 *  с handle директора: «если уверен что перевод реально прошёл — напиши».
 *  Это закрывает кейс «забыл прислать вовремя → оформил заново → старый чек».
 *  Для веток «Vision вообще ничего не разобрал» / «нет operation_id» —
 *  фолбэк не нужен, там клиент явно прислал не банковский чек. */
function buildRetryMessage(
  checks: import("@/lib/payments/match-receipt").FourCheckResult,
  visionResult: Awaited<ReturnType<typeof recognizeReceipt>> | null,
  orderNumber: number,
  directorHandle: string | null
): string {
  const tail = `\n\nЗаказ №${orderNumber} ждёт оплаты.`;
  const directorLine = directorHandle
    ? `\n\nЕсли ты уверен, что перевод реально прошёл — напиши ${directorHandle}, разберёмся.`
    : "";

  // Vision не разобрал чек вообще — мутное фото / скриншот не того.
  const nothingExtracted =
    !visionResult ||
    (visionResult.transferredAmount == null &&
      visionResult.transferDatetime == null &&
      visionResult.recipientCardLast4 == null &&
      visionResult.recipientPhone == null &&
      visionResult.recipientIpName == null);

  if (nothingExtracted) {
    return (
      `📌 Не получилось автоматически распознать чек — изображение нечитаемое.\n\n` +
      `Пришли чек в PDF-формате: в банке открой операцию → «Поделиться чеком» → выбери PDF.` +
      tail
    );
  }

  // Приоритет: operation_id → сумма → получатель → дата.
  // operation_id (номер операции / квитанции) обязателен — без него чек юридически
  // не идентифицируется. Превью перевода в банк-приложении его не показывает.
  if (!checks.replay.pass && checks.replay.reason === "не виден номер операции") {
    return (
      `📌 В чеке не виден номер операции — без него мы не можем подтвердить оплату.\n\n` +
      `Открой операцию в банке → «Поделиться чеком» → выбери PDF и пришли сюда. ` +
      `На полноценном чеке номер операции есть всегда.` +
      tail
    );
  }

  if (!checks.amount.pass) {
    if (checks.amount.reason.startsWith("Vision не разобрал")) {
      return (
        `📌 Не получилось разобрать сумму перевода в чеке. ` +
        `Пришли PDF-квитанцию из приложения банка («Поделиться чеком») — там сумма читаемая.` +
        tail
      );
    }
    return (
      `⚠️ ${capitalizeFirst(checks.amount.reason)}.\n\n` +
      `Пришли чек на полную сумму или доплати разницу свежим переводом.${directorLine}` +
      tail
    );
  }

  if (!checks.recipient.pass) {
    const visionTail: string[] = [];
    if (visionResult?.recipientCardLast4) {
      visionTail.push(`карта в чеке ••${visionResult.recipientCardLast4}`);
    }
    if (visionResult?.recipientPhone) {
      visionTail.push(`телефон в чеке ${visionResult.recipientPhone}`);
    }
    if (visionResult?.recipientIpName) {
      visionTail.push(`получатель в чеке «${visionResult.recipientIpName}»`);
    }
    const extraLine = visionTail.length > 0 ? `\n\nЧто я увидел: ${visionTail.join(", ")}.` : "";
    return (
      `⚠️ Получатель в чеке не совпадает с реквизитами оплаты.${extraLine}\n\n` +
      `Перепроверь, что переводил по реквизитам выше, и пришли правильный чек.${directorLine}` +
      tail
    );
  }

  if (!checks.date.pass) {
    if (checks.date.reason.startsWith("Vision не разобрал")) {
      return (
        `📌 Не получилось разобрать дату чека. ` +
        `Пришли PDF-квитанцию из приложения банка — там дата читаемая.` +
        tail
      );
    }
    return (
      `⚠️ Чек старше суток — мы принимаем только переводы за последние 24 часа.\n\n` +
      `Сделай новый перевод по реквизитам выше и пришли свежий чек.${directorLine}` +
      tail
    );
  }

  // Сюда не должны попадать (allPass=false подразумевает хоть одну ❌),
  // но на всякий случай — generic fallback.
  return (
    `📌 Не получилось автоматически распознать чек — нам не хватило информации.\n\n` +
    `Пришли PDF-квитанцию из приложения банка («Поделиться чеком»).` +
    tail
  );
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function sendDirectorReview(
  supabase: ReturnType<typeof createServiceClient>,
  pending: PendingForReview,
  filePath: string,
  visionResult: Awaited<ReturnType<typeof recognizeReceipt>> | null,
  extra?: { checks?: string; hint?: string }
) {
  let receiptBuffer: Buffer | null = null;
  try {
    const { data: blob } = await supabase.storage.from("receipts").download(filePath);
    if (blob) receiptBuffer = Buffer.from(await blob.arrayBuffer());
  } catch (e) {
    console.error("[sendDirectorReview] receipt download failed:", e);
  }

  let customerInfo: { name: string | null; telegram_username: string | null } | null = null;
  if (pending.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, telegram_username")
      .eq("id", pending.customer_id)
      .maybeSingle();
    customerInfo = customer ?? null;
  }

  if (!receiptBuffer) {
    console.warn("[sendDirectorReview] no receipt buffer, skipping director DM");
    return;
  }

  await notifyDirectorPendingReceiptForReview({
    pendingOrderId: pending.id,
    orderNumber: Number(pending.order_number),
    clientPrice: Number(pending.client_price),
    customerName: customerInfo?.name ?? null,
    customerUsername: customerInfo?.telegram_username ?? null,
    receiptBuffer,
    visionAmount: visionResult?.transferredAmount ?? null,
    visionRecipientName: visionResult?.recipientName ?? null,
    visionRecipientBank: visionResult?.recipientBank ?? null,
    checksDetails: extra?.checks,
    hint: extra?.hint,
  }).catch((e) => console.error("notifyDirectorPendingReceiptForReview failed:", e));

  if (pending.customer_id) {
    try {
      const { data: customer } = await supabase
        .from("customers")
        .select("tg_user_id")
        .eq("id", pending.customer_id)
        .maybeSingle();
      if (customer?.tg_user_id) {
        const bot = getCustomerBotForNotifications();
        await bot.api.sendMessage(
          Number(customer.tg_user_id),
          `🔍 Заказ №${pending.order_number} — отправили чек владельцу на ручную проверку. Подтвердим как только увидит.`
        );
      }
    } catch (e) {
      console.error("[sendDirectorReview] customer DM failed:", e);
    }
  }

  // Чек теперь на ручной проверке у директора. Растягиваем pending до 24ч
  // (10-минутный expire-pending-order сам игнорирует pending'и с
  // receipt_received_at NOT NULL). Сводное напоминание директору идёт
  // отдельным digest-job'ом каждые 6ч сразу по всем pending'ам.
  const { scheduleDirectorPaymentExpire } = await import("@/lib/jobs/queues");
  scheduleDirectorPaymentExpire(pending.id).catch((e) =>
    console.error("[sendDirectorReview] scheduleDirectorPaymentExpire failed:", e)
  );
}

/** Replay 2-я попытка: тащим оригинал чека из orders по operation_id и шлём
 *  директору два чека для глазного сравнения. */
async function sendReplayDirectorReview(
  supabase: ReturnType<typeof createServiceClient>,
  pending: PendingForReview,
  newReceiptPath: string,
  visionResult: NonNullable<Awaited<ReturnType<typeof recognizeReceipt>>>
) {
  const operationId = visionResult.operationId;
  if (!operationId) {
    console.warn("[sendReplayDirectorReview] no operationId, abort");
    return;
  }

  const { data: originalOrder } = await supabase
    .from("orders")
    .select("id, order_number, receipt_storage_path, client_price, paid_at")
    .eq("vision_operation_id", operationId)
    .limit(1)
    .maybeSingle();

  if (!originalOrder) {
    console.warn(
      `[sendReplayDirectorReview] no original order found for operation_id=${operationId}, fallback to generic review`
    );
    await sendDirectorReview(supabase, pending, newReceiptPath, visionResult, {
      hint: "клиент прислал чек повторно, но оригинал найти не удалось — проверь глазами",
    });
    return;
  }

  let newReceiptBuffer: Buffer | null = null;
  try {
    const { data: blob } = await supabase.storage.from("receipts").download(newReceiptPath);
    if (blob) newReceiptBuffer = Buffer.from(await blob.arrayBuffer());
  } catch (e) {
    console.error("[sendReplayDirectorReview] new receipt download failed:", e);
  }

  let originalReceiptBuffer: Buffer | null = null;
  if (originalOrder.receipt_storage_path) {
    try {
      const { data: blob } = await supabase.storage
        .from("receipts")
        .download(originalOrder.receipt_storage_path);
      if (blob) originalReceiptBuffer = Buffer.from(await blob.arrayBuffer());
    } catch (e) {
      console.error("[sendReplayDirectorReview] original receipt download failed:", e);
    }
  }

  if (!newReceiptBuffer) {
    console.warn("[sendReplayDirectorReview] no new receipt buffer, abort");
    return;
  }

  let customerInfo: { name: string | null; telegram_username: string | null } | null = null;
  if (pending.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, telegram_username")
      .eq("id", pending.customer_id)
      .maybeSingle();
    customerInfo = customer ?? null;
  }

  await notifyDirectorReplaySuspicion({
    pendingOrderId: pending.id,
    newOrderNumber: Number(pending.order_number),
    newClientPrice: Number(pending.client_price),
    customerName: customerInfo?.name ?? null,
    customerUsername: customerInfo?.telegram_username ?? null,
    newReceiptBuffer,
    originalOrderNumber: Number(originalOrder.order_number),
    originalPaidAt: originalOrder.paid_at,
    originalClientPrice:
      originalOrder.client_price != null ? Number(originalOrder.client_price) : null,
    originalReceiptBuffer,
    operationId,
  }).catch((e) => console.error("notifyDirectorReplaySuspicion failed:", e));

  if (pending.customer_id) {
    try {
      const { data: customer } = await supabase
        .from("customers")
        .select("tg_user_id")
        .eq("id", pending.customer_id)
        .maybeSingle();
      if (customer?.tg_user_id) {
        const bot = getCustomerBotForNotifications();
        await bot.api.sendMessage(
          Number(customer.tg_user_id),
          `🔍 Заказ №${pending.order_number} — отправили чек владельцу на ручную проверку. Подтвердим как только увидит.`
        );
      }
    } catch (e) {
      console.error("[sendReplayDirectorReview] customer DM failed:", e);
    }
  }

  const { scheduleDirectorPaymentExpire } = await import("@/lib/jobs/queues");
  scheduleDirectorPaymentExpire(pending.id).catch((e) =>
    console.error("[sendReplayDirectorReview] scheduleDirectorPaymentExpire failed:", e)
  );
}

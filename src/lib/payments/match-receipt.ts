/**
 * Multi-signal проверка чека (Этап 4 walkthrough).
 *
 * Сервер выполняет 4 проверки после распознавания Vision'ом:
 *   1. anti-replay: operation_id не использовался ранее.
 *   2. сумма: transferred_amount >= expected - 1₽.
 *   3. дата: transfer_datetime >= pending.created_at - 60 сек.
 *   4. получатель: один активный payment_method жёстко совпал по типу.
 *
 * Все 4 = pass → auto-confirm. Хоть одна = fail → к директору с детализацией.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReceiptVisionResult } from "@/lib/ai/receipt-vision";

export type PaymentMethodForMatch = {
  id: string;
  kind: "card" | "sbp" | "ip_qr";
  label: string;
  cardLast4: string | null;
  sbpPhone: string | null;
  ipName: string | null;
  holderName: string | null;
  bankName: string | null;
};

export type RecipientMatch = {
  matched: PaymentMethodForMatch | null;
  matchedField: "card_last4" | "sbp_phone" | "ip_name" | null;
};

export type CheckOutcome = { pass: boolean; reason: string };

export type FourCheckResult = {
  replay: CheckOutcome;
  amount: CheckOutcome;
  date: CheckOutcome;
  recipient: CheckOutcome & RecipientMatch;
  allPass: boolean;
};

/** Нормализуем телефон в 11 цифр, ведущая 8 → 7. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  if (digits.length === 10) digits = "7" + digits;
  return digits.length === 11 ? digits : null;
}

/** Нормализуем имя ИП: lowercase, схлопываем пробелы, убираем префикс «ИП»/«ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ». */
export function normalizeIpName(value: string | null | undefined): string | null {
  if (!value) return null;
  let s = value.trim().toLowerCase().replace(/\s+/g, " ");
  s = s.replace(/^ип\s+/, "");
  s = s.replace(/^индивидуальный\s+предприниматель\s+/, "");
  return s.length > 0 ? s : null;
}

export function matchReceiptToPaymentMethods(
  vision: Pick<ReceiptVisionResult, "recipientCardLast4" | "recipientPhone" | "recipientIpName">,
  methods: PaymentMethodForMatch[]
): RecipientMatch {
  const visionPhone = normalizePhone(vision.recipientPhone);
  const visionIp = normalizeIpName(vision.recipientIpName);
  const visionLast4 = vision.recipientCardLast4?.replace(/\D/g, "").slice(-4) || null;

  for (const m of methods) {
    if (m.kind === "card" && visionLast4 && m.cardLast4 && visionLast4 === m.cardLast4) {
      return { matched: m, matchedField: "card_last4" };
    }
    if (m.kind === "sbp" && visionPhone) {
      const mPhone = normalizePhone(m.sbpPhone);
      if (mPhone && visionPhone === mPhone) {
        return { matched: m, matchedField: "sbp_phone" };
      }
    }
    if (m.kind === "ip_qr" && visionIp) {
      const mIp = normalizeIpName(m.ipName);
      if (mIp && visionIp === mIp) {
        return { matched: m, matchedField: "ip_name" };
      }
    }
  }

  return { matched: null, matchedField: null };
}

export type FourCheckInput = {
  vision: ReceiptVisionResult;
  expectedAmount: number;
  pendingCreatedAt: Date;
  amountToleranceRub?: number;
};

/**
 * Окно «свежести» чека. Принимаем переводы за последние 24 часа от момента
 * создания pending'а. Покрывает кейс «забыл прислать чек вовремя в 10 мин →
 * pending слетел → оформил заново через час с тем же чеком». Anti-replay
 * по operation_id отдельно защищает от повторного использования чека.
 */
const RECEIPT_MAX_AGE_HOURS = 24;

export async function runFourChecks(
  supabase: SupabaseClient,
  input: FourCheckInput
): Promise<FourCheckResult> {
  const tolerance = input.amountToleranceRub ?? 1;

  const replay = await checkAntiReplay(supabase, input.vision.operationId);
  const amount = checkAmount(input.vision.transferredAmount, input.expectedAmount, tolerance);
  const date = checkDate(input.vision.transferDatetime, input.pendingCreatedAt);
  const recipient = await checkRecipient(supabase, input.vision);

  return {
    replay,
    amount,
    date,
    recipient,
    allPass: replay.pass && amount.pass && date.pass && recipient.pass,
  };
}

async function checkAntiReplay(
  supabase: SupabaseClient,
  operationId: string | null
): Promise<CheckOutcome> {
  // operation_id (номер операции / номер квитанции / номер перевода СБП) — обязателен.
  // Без него чек невозможно идентифицировать как уникальный, и Vision не имеет
  // надёжного якоря для anti-replay. На превью перевода в банк-приложении
  // operation_id не показан — клиент должен прислать настоящий чек / PDF из
  // «Поделиться чеком».
  if (!operationId) {
    return { pass: false, reason: "не виден номер операции" };
  }
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("vision_operation_id", operationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[runFourChecks] anti-replay query failed:", error);
    return { pass: false, reason: "ошибка БД при проверке operation_id" };
  }
  if (data) {
    return { pass: false, reason: `этот чек уже использован для заказа №${data.order_number}` };
  }

  // Канон §8.1: единый namespace — тот же operation_id мог быть
  // использован для погашения +ВАЙБ-долга (vibe_payments), не только
  // для заказа. Без этой ветки чек оплаты долга можно было бы повторно
  // зачесть как оплату заказа.
  const { data: vibeData, error: vibeError } = await supabase
    .from("vibe_payments")
    .select("id")
    .eq("operation_id", operationId)
    .limit(1)
    .maybeSingle();
  if (vibeError) {
    console.error("[runFourChecks] anti-replay vibe query failed:", vibeError);
    return { pass: false, reason: "ошибка БД при проверке operation_id" };
  }
  if (vibeData) {
    return { pass: false, reason: "этот чек уже использован для погашения долга" };
  }

  return { pass: true, reason: "operation_id уникальный" };
}

function checkAmount(
  visionAmount: number | null,
  expected: number,
  tolerance: number
): CheckOutcome {
  if (visionAmount == null) {
    return { pass: false, reason: "Vision не разобрал сумму" };
  }
  if (visionAmount < expected - tolerance) {
    return {
      pass: false,
      reason: `недоплата: пришло ${visionAmount} ₽, ожидалось ${expected} ₽`,
    };
  }
  return {
    pass: true,
    reason: visionAmount > expected ? `переплата ${visionAmount - expected} ₽` : "сумма совпала",
  };
}

function checkDate(visionDatetime: Date | null, pendingCreatedAt: Date): CheckOutcome {
  if (!visionDatetime) {
    return { pass: false, reason: "Vision не разобрал дату чека" };
  }
  const minAllowed = pendingCreatedAt.getTime() - RECEIPT_MAX_AGE_HOURS * 60 * 60 * 1000;
  if (visionDatetime.getTime() < minAllowed) {
    return {
      pass: false,
      reason: `чек старше ${RECEIPT_MAX_AGE_HOURS} часов`,
    };
  }
  return { pass: true, reason: "чек свежий" };
}

async function checkRecipient(
  supabase: SupabaseClient,
  vision: ReceiptVisionResult
): Promise<CheckOutcome & RecipientMatch> {
  const { data: rawMethods, error } = await supabase
    .from("payment_methods")
    .select("id, kind, label, card_number_last4, sbp_phone, ip_name, holder_name, bank_name")
    .eq("is_active", true);

  if (error) {
    console.error("[runFourChecks] payment_methods query failed:", error);
    return {
      pass: false,
      reason: "ошибка БД при загрузке payment_methods",
      matched: null,
      matchedField: null,
    };
  }

  const methods: PaymentMethodForMatch[] = (rawMethods ?? []).map((m) => ({
    id: m.id,
    kind: m.kind as PaymentMethodForMatch["kind"],
    label: m.label,
    cardLast4: m.card_number_last4,
    sbpPhone: m.sbp_phone,
    ipName: m.ip_name,
    holderName: m.holder_name,
    bankName: m.bank_name,
  }));

  const match = matchReceiptToPaymentMethods(vision, methods);

  if (!match.matched) {
    return {
      pass: false,
      reason: "получатель не совпал ни с одним активным методом",
      matched: null,
      matchedField: null,
    };
  }

  const fieldRu =
    match.matchedField === "card_last4"
      ? "last4 карты"
      : match.matchedField === "sbp_phone"
        ? "телефону СБП"
        : "имени ИП";
  return {
    pass: true,
    reason: `совпало с «${match.matched.label}» по ${fieldRu}`,
    matched: match.matched,
    matchedField: match.matchedField,
  };
}

/** Форматирует результат 4-х проверок в строку для caption директору. */
export function formatChecksForDirector(result: FourCheckResult): string {
  const line = (label: string, c: CheckOutcome) => `${c.pass ? "✅" : "❌"} ${label}: ${c.reason}`;
  return [
    line("Анти-replay", result.replay),
    line("Сумма", result.amount),
    line("Дата", result.date),
    line("Получатель", result.recipient),
  ].join("\n");
}

/**
 * Sync Avito-заказов в общую таблицу `orders` (ТЗ Авито-заказы §5).
 *
 * Авито-заказ живёт ОДНОВРЕМЕННО в двух местах:
 * - `avito_orders` — raw-кеш API-ответа (источник для существующих UI).
 * - `orders` — каноническая таблица всех заказов (source='avito'),
 *   откуда работают отправщик, финансы, аналитика.
 *
 * Эта пара функций отвечает за вторую часть: маппит avito-данные в
 * orders-схему и делает upsert по уникальному avito_order_id.
 *
 * Канон: BUSINESS_LOGIC.md §15 (Авито) + §4 (state machine) + §9 (финансы).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types/database";
import type {
  ParsedAvitoOrderDetail,
  ParsedAvitoOrderLog,
} from "./order-detail-parser";

/**
 * Мэппинг Avito-статусов (status.value + status_label) → наш OrderStatus.
 *
 * Granular статусы из реальных заказов (probe + наблюдения в UI):
 *   accepted              Завершён                  → delivered
 *   voided                Отменён                   → cancelled
 *   on_delivery_return    Возврат: заберите заказ   → return
 *   payout_wait           Можно получить оплату     → delivered
 *
 * statusGroup-категории (из фильтра /profile/orders), могут выступать
 * как granular значения у части заказов:
 *   waiting_confirmation  Ждут подтверждения        → awaiting_size (если без размера) / paid
 *   waiting_shipment      Ждут отправки             → paid
 *   in_transit            В пути                    → sent
 *   delivered_in_pvz      Доставлен в ПВЗ           → sent (покупатель ещё не забрал)
 *   on_return             На возврате               → return_in_transit (общий зонтик)
 *   disputed              Спорные                   → problem
 *   finished              Завершённые               → delivered
 *   canceled              Отменённые                → cancelled
 *
 * Если статус не распознан — возвращаем null, оставляем текущий статус
 * заказа в orders без изменений (log в caller).
 *
 * `hasUnknownSize=true` при первом заходе означает «новый заказ, размера
 * пока нет» — статус ставим awaiting_size, даже если Avito говорит
 * payment_complete / waiting_confirmation.
 */
export function mapAvitoStatusToOrderStatus(args: {
  avitoStatus: string | null;
  avitoStatusLabel: string | null;
  requiredAction: boolean;
  hasUnknownSize: boolean;
}): OrderStatus | null {
  const s = (args.avitoStatus ?? "").toLowerCase();
  const label = (args.avitoStatusLabel ?? "").toLowerCase();

  // Терминальные / возвратные ветки — приоритет над «нет размера»:
  // если заказ уже доставлен/отменён/возвращён, неважно был ли уточнён
  // размер на нашей стороне.
  if (s === "voided" || s === "cancelled" || s === "canceled") return "cancelled";
  if (
    s === "accepted" ||
    s === "delivered" ||
    s === "completed" ||
    s === "finished" ||
    s === "payout_wait"
  ) {
    return "delivered";
  }
  if (s === "return_completed" || s === "return_done") return "return_done";
  if (s.includes("return")) {
    // on_delivery_return / Возврат: заберите — возврат уже на ПВЗ.
    if (
      s === "on_delivery_return" ||
      label.includes("заберите") ||
      label.includes("на пвз") ||
      label.includes("на пункте")
    ) {
      return "return";
    }
    // on_return / return_initiated / return_in_progress / return_in_transit — в пути.
    return "return_in_transit";
  }
  // disputed — спорные заказы, в нашей системе это problem.
  if (s === "disputed") return "problem";

  // Активная ветка (до доставки покупателю).
  // Новый заказ без размера → awaiting_size.
  if (args.hasUnknownSize) return "awaiting_size";

  // С размером:
  // in_transit / delivered_in_pvz означают «отправили, едет/лежит в ПВЗ»
  // — для нас это sent (мы своё сделали).
  if (
    s === "in_delivery" ||
    s === "in_transit" ||
    s === "delivered_in_pvz" ||
    s === "sent"
  ) {
    return "sent";
  }
  if (
    s === "payment_complete" ||
    s === "paid" ||
    s === "awaiting_packing" ||
    s === "packing" ||
    s === "collecting" ||
    s === "waiting_confirmation" ||
    s === "waiting_shipment"
  ) {
    return "paid";
  }

  // Не распознали — caller оставит текущий статус.
  return null;
}

export interface AvitoOrderRow {
  /** Сырой avito_order_id (string), уникален в пределах user_id. */
  avito_order_id: string;
  status: string | null;
  status_label: string | null;
  required_action: boolean;
  item_title: string | null;
  item_img_url: string | null;
  cost_total: number | null;
  tracking_number: string | null;
  // delivery_details.deadline — дата отправки (ISO).
  // delivery_details.barcodeUrl / barcodeType / parcelId — наш стикер.
  // delivery_details.pickupAddress — адрес ПВЗ.
  delivery_details: Record<string, unknown> | null;
  avito_item_id: string | number | null;
  created_at_avito: string | null;
  updated_at_avito: string | null;
}

export interface ProductMapping {
  product_id: string;
  /** Закупочная цена товара — нужна для NOT NULL поля orders.purchase_price. */
  purchase_price: number;
}

/**
 * Upsert Авито-заказа в общую таблицу `orders` (source='avito').
 *
 * - Уникальный ключ: avito_order_id (string).
 * - При insert: status подбирается по mapAvitoStatusToOrderStatus +
 *   hasUnknownSize=(product_id is null || size is null).
 * - При update: статус НЕ откатываем назад в state machine. Если маппер
 *   вернул null — оставляем текущий.
 * - Поля-снапшоты таймлайна (delivered_at / return_*_at) проставляются
 *   ровно один раз при переходе соответствующего статуса.
 * - customer_id, partner_id — всегда NULL для Авито.
 * - pickup_by — fallback `send_by + 14 дней` (NOT NULL в схеме; реальный
 *   срок выставляет покупатель Авито при инициации возврата).
 *
 * Возвращает id строки в `orders` или null если skip (нет user_id).
 */
export async function upsertOrderFromAvito(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  ownerUserId: string;
  avitoOrder: AvitoOrderRow;
  mapping: ProductMapping | null;
  /** ТЗ §15.9: данные из /api/2/profile/order (buyer.name, avito_fee, channelId). */
  parsedDetail?: ParsedAvitoOrderDetail | null;
  /** ТЗ §15.9: данные из /api/2/order-log (точные timestamps + tracking). */
  parsedLog?: ParsedAvitoOrderLog | null;
}): Promise<{ orderId: string; status: OrderStatus; isNew: boolean } | null> {
  const { supabase, ownerUserId, avitoOrder, mapping, parsedDetail, parsedLog } = args;

  // 1) Достаём существующий заказ (если уже синкали раньше) — нужно
  // решить, ставим ли timeline-снапшоты сейчас и не откатываем ли статус.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("orders")
    .select(
      "id, status, product_id, product_size_id, delivered_at, return_initiated_at, return_arrived_at"
    )
    .eq("source", "avito")
    .eq("avito_order_id", avitoOrder.avito_order_id)
    .maybeSingle();

  const hasUnknownSize =
    !existing?.product_size_id && (!mapping?.product_id || !existing?.product_size_id);

  const mapped = mapAvitoStatusToOrderStatus({
    avitoStatus: avitoOrder.status,
    avitoStatusLabel: avitoOrder.status_label,
    requiredAction: avitoOrder.required_action,
    hasUnknownSize,
  });

  // Если маппер не понял статус, оставляем текущий или paid дефолтом.
  const targetStatus: OrderStatus =
    mapped ?? (existing?.status as OrderStatus | undefined) ?? "awaiting_size";

  // 2) Дедлайны.
  const details = avitoOrder.delivery_details ?? {};
  const deadlineRaw = (details as { deadline?: string }).deadline ?? null;
  // sendBy должен быть валидным ISO date — иначе addDaysIso бросит RangeError.
  let sendBy = todayIso();
  if (deadlineRaw && !isNaN(new Date(deadlineRaw).getTime())) {
    sendBy = new Date(deadlineRaw).toISOString().slice(0, 10);
  }
  const pickupBy = addDaysIso(sendBy, 14); // потолок Авито (NOT NULL fallback)

  // 3) Адрес и стикер.
  const pickupAddress = (details as { pickupAddress?: string }).pickupAddress ?? null;
  const barcodeUrl = (details as { barcodeUrl?: string }).barcodeUrl ?? null;
  const trackingNumber = avitoOrder.tracking_number ?? null;

  // 4) Поля-снапшоты таймлайна — ставим однократно при переходе.
  const now = new Date().toISOString();
  const deliveredAt =
    targetStatus === "delivered" && !existing?.delivered_at ? now : existing?.delivered_at ?? null;
  const returnInitiatedAt =
    (targetStatus === "return_in_transit" || targetStatus === "return") &&
    !existing?.return_initiated_at
      ? now
      : existing?.return_initiated_at ?? null;
  const returnArrivedAt =
    targetStatus === "return" && !existing?.return_arrived_at
      ? now
      : existing?.return_arrived_at ?? null;

  // ТЗ §15.9: BeduinUI-данные приоритетны если есть — точные значения от Avito.
  const buyerName = parsedDetail?.buyerName ?? extractBuyerName(details);
  const avitoFee = parsedDetail?.avitoFee ?? null;
  const clientPrice =
    parsedDetail?.clientPrice != null
      ? parsedDetail.clientPrice
      : avitoOrder.cost_total ?? 0;
  // tracking_number — приоритет: order-log > details.parcelId > avito_orders.
  const trackingFinal =
    parsedLog?.trackingNumber ?? trackingNumber ?? null;

  // delivery_details расширяем channelId (для findChatForAvitoOrder)
  // + сохраняем сырые details для дебага.
  const mergedDeliveryDetails: Record<string, unknown> = {
    ...details,
  };
  if (parsedDetail?.channelId) {
    mergedDeliveryDetails.channelId = parsedDetail.channelId;
  }
  if (parsedDetail?.buyerUserKey) {
    mergedDeliveryDetails.buyerUserKey = parsedDetail.buyerUserKey;
  }

  // Timeline-снапшоты — приоритет parsedLog.* над автоматическими now-stamps.
  const paidAtFinal =
    parsedLog?.paidAt ?? avitoOrder.created_at_avito ?? now;
  const sentAtFinal =
    parsedLog?.sentAt ?? null;
  const deliveredAtFinal =
    parsedLog?.deliveredAt ?? deliveredAt;
  const returnInitiatedFinal =
    parsedLog?.returnInitiatedAt ?? returnInitiatedAt;
  const returnArrivedFinal =
    parsedLog?.returnArrivedAt ?? returnArrivedAt;

  // 5) Собираем payload.
  const payload = {
    source: "avito" as const,
    avito_order_id: avitoOrder.avito_order_id,
    avito_buyer_name: buyerName,
    avito_delivery_address: pickupAddress,
    avito_fee_snapshot: avitoFee,
    // Отправка (sendBarcode/dispatchNumber/sellerSendTill)
    avito_dispatch_code: parsedDetail?.dispatchCode ?? null,
    avito_dispatch_barcode_url: parsedDetail?.dispatchBarcodeUrl ?? null,
    avito_send_till_text: parsedDetail?.sellerSendTill ?? null,
    avito_delivery_provider_name: parsedDetail?.deliveryProviderName ?? null,
    // Возврат (returnDeliveryInfo)
    avito_return_track: parsedDetail?.returnTrackingCode ?? null,
    avito_return_barcode_url: parsedDetail?.returnBarcodeUrl ?? null,
    avito_return_receive_by_text: parsedDetail?.returnReceiveBy ?? null,
    avito_return_destroy_by_text: parsedDetail?.returnDestroyBy ?? null,
    avito_return_tracking_url: parsedDetail?.returnTrackingUrl ?? null,
    avito_return_provider_name: parsedDetail?.returnProviderName ?? null,
    avito_return_confirm_code_enabled: parsedDetail?.returnConfirmCodeEnabled ?? false,
    customer_id: null,
    partner_id: null,
    product_id: mapping?.product_id ?? existing?.product_id ?? null,
    product_size_id: existing?.product_size_id ?? null,
    size: null,
    purchase_price: mapping?.purchase_price ?? 0,
    client_price: clientPrice,
    delivery_service: "avito" as const,
    tracking_number: trackingFinal,
    barcode_image_url: barcodeUrl,
    delivery_deadline: sendBy,
    send_by: sendBy,
    pickup_by: pickupBy,
    status: targetStatus,
    is_paid: true, // Авито принимает оплату до отгрузки
    paid_at: paidAtFinal,
    shipped_at: sentAtFinal,
    delivered_at: deliveredAtFinal,
    return_initiated_at: returnInitiatedFinal,
    return_arrived_at: returnArrivedFinal,
    system_comment: !mapping?.product_id
      ? "Авито-объявление не привязано к товару"
      : null,
    updated_at: now,
  };
  // Подменяем delivery_details на расширенный — но только если payload
  // куда-то его пишет (сейчас не пишет; кладём channelId в payload отдельно
  // через avito_orders.delivery_details). Для findChatForAvitoOrder
  // важно чтобы channelId был в avito_orders.delivery_details, а это
  // обновляется в caller'е (sync-avito-orders apartheid upsert).
  void mergedDeliveryDetails;

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("orders")
      .update(payload)
      .eq("id", existing.id);
    if (error) {
      console.error("[order-sync] update error", avitoOrder.avito_order_id, error.message);
      return null;
    }
    return { orderId: existing.id, status: targetStatus, isNew: false };
  }

  // Insert новый заказ.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("orders")
    .insert({ ...payload, created_at: now })
    .select("id")
    .single();
  if (error) {
    console.error("[order-sync] insert error", avitoOrder.avito_order_id, error.message);
    return null;
  }
  return { orderId: data.id as string, status: targetStatus, isNew: true };
  // ownerUserId сейчас не используется напрямую (orders нет owner_id колонки),
  // но оставлен как явная связь сессии для будущих расширений.
  void ownerUserId;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    // Невалидная дата — фолбэк today + days
    return addDaysIso(todayIso(), days);
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractBuyerName(details: Record<string, unknown>): string | null {
  // Avito API не отдаёт имя покупателя напрямую в delivery_details —
  // оно появляется в карточке заказа. Если позже найдём — обновим здесь.
  const name = (details as { buyerName?: string }).buyerName;
  return typeof name === "string" && name.length > 0 ? name : null;
}

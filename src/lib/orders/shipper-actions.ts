import { cancelMoveToTrash, scheduleAutoResumeProblem, cancelExpireSendBy } from "@/lib/jobs";

// Phase B: scheduleOrderExpiration / scheduleDeadlineReminder / scheduleReturnArrived /
// cancelOrderJobs снесены вместе с Track.global подсистемой. Phase C введёт новые jobs:
// expire-send-by, expire-pickup-by, daily-shipper-cleanup. Места их планирования и
// отмены пометил TODO ниже — заполню при сборке Phase C.
import { validateTransition } from "@/lib/orders/transitions";
import { appendStatusHistory } from "@/lib/orders/status-history";
import {
  notifyOwnerStockMismatch,
  notifyCustomerOrderShipped,
  notifyCustomerOrderCancelled,
  notifyCustomerOrderReturnPickedUp,
  notifyCustomerOrderQualityIssue,
  notifyCustomerOrderCollecting,
  notifyCustomerOrderProblem,
  notifyPartnerOrderRefundDue,
  sendByRoute,
} from "@/lib/telegram/notifications";
import { resolvePartnerRefundContext } from "@/lib/orders/partner-refund-context";
import { cancelAvitoOrderViaApi } from "@/lib/avito/cancel";
import { DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";
import { editOrderSummary, buildSummaryFromOrderId } from "@/lib/telegram/orders-group";
import type { OrderStatus } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.generated";

type Supabase = SupabaseClient<Database>;

/** Run a promise with a timeout — resolves with undefined on timeout instead of hanging */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

/**
 * Safely cancel BullMQ jobs for an order with a 3s timeout — never blocks the response.
 * Сейчас отменяет только expire-send-by (Phase C). Если в будущем появятся
 * другие per-order job'ы (re-tracking, etc.) — добавлять сюда.
 */
function safeCancelOrderJobs(orderId: string): void {
  fireBullMQ(() => cancelExpireSendBy(orderId), "cancelExpireSendBy");
}

/** Fire-and-forget BullMQ call with 3s timeout */
function fireBullMQ(fn: () => Promise<unknown>, label: string): void {
  withTimeout(fn(), 3000).catch((e) => console.error(`[shipper-actions] ${label} failed:`, e));
}

/** Minimal order shape needed by action functions (from .select("*") on orders) */
export type OrderForAction = {
  id: string;
  status: string | null;
  status_history: Json | null;
  order_number: number;
  product_size_id: string | null;
  product_id: string | null;
  customer_id: string | null;
  client_price: number;
  is_paid: boolean;
  tracking_number: string | null;
  delivery_service: string | null;
  avito_order_id: string | null;
  shipped_at: string | null;
  send_by: string;
  barcode_printed: boolean;
  linked_return_order_id: string | null;
  problem_type: string | null;
  system_comment: string | null;
  expected_return_date: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  partner_id: string | null;
  source: string | null;
};

export type ActionResult = { success: true } | { success: false; error: string };

// ─── Helpers ───────────────────────────────────────────────────

function tryValidateTransition(current: string | null, target: OrderStatus): string | null {
  try {
    validateTransition(current as OrderStatus, target);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Adjust actual_quantity (shipper's physical count). Only acts when actual_quantity IS NOT NULL.
 * После миграции 20260415000001 все заказы гарантированно имеют product_size_id
 * (sizeless ссылаются на строку 'One Size'), поэтому ветка через products удалена. */
async function adjustActualStock(
  supabase: Supabase,
  order: OrderForAction,
  delta: number
): Promise<void> {
  if (!order.product_size_id) return;
  await supabase.rpc("adjust_actual_quantity", {
    target_size_id: order.product_size_id,
    delta,
  });
}

/**
 * DM при `return_done`. Если заказ партнёрский — клиенту шлём контакты
 * партнёра + поддержки, партнёру — контакт клиента + поддержки. Если owner —
 * стандартный «X₽ зачислено на твой баланс».
 */
async function sendReturnPickedUpDms(
  supabase: Supabase,
  order: OrderForAction,
  isPartnerOrder: boolean
): Promise<void> {
  if (!order.customer_id) return;

  if (isPartnerOrder && order.partner_id && order.is_paid && order.client_price > 0) {
    const ctx = await resolvePartnerRefundContext(supabase, order.partner_id, order.customer_id);
    if (ctx) {
      await Promise.all([
        notifyCustomerOrderReturnPickedUp({
          customerId: order.customer_id,
          orderId: order.id,
          orderNumber: order.order_number,
          partnerRefund: {
            partnerLabel: ctx.partnerLabel,
            supportUsername: ctx.supportUsername,
            amount: order.client_price,
          },
        }).catch((e) => console.error("[shipper-actions] notify customer return failed:", e)),
        notifyPartnerOrderRefundDue({
          partnerId: order.partner_id,
          orderNumber: order.order_number,
          amount: order.client_price,
          customerLabel: ctx.customerLabel,
          supportUsername: ctx.supportUsername,
          kind: "return_done",
        }).catch((e) => console.error("[shipper-actions] notify partner refund failed:", e)),
      ]);
      return;
    }
    // Fallback: контакты не подгрузились — шлём минимум.
  }

  await notifyCustomerOrderReturnPickedUp({
    customerId: order.customer_id,
    orderId: order.id,
    orderNumber: order.order_number,
    refundedAmount: order.is_paid ? order.client_price : null,
  }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderReturnPickedUp failed:", e));
}

async function restoreStock(supabase: Supabase, order: OrderForAction): Promise<void> {
  // current_quantity возвращается триггером update_product_quantity_on_order
  // на UPDATE OF status (см. миграцию 20260501000020). Здесь только actual_quantity
  // (физический остаток отправщика) и пробуждение problem-очереди.
  if (order.product_size_id) {
    scheduleAutoResumeProblem(order.product_size_id).catch((e) =>
      console.error("[shipper-actions] scheduleAutoResumeProblem failed:", e)
    );
  }

  await adjustActualStock(supabase, order, 1);
}

// ─── Actions ───────────────────────────────────────────────────

/**
 * start_collecting: paid → collecting (BUSINESS_LOGIC §4.4 «Беру в работу»).
 * Закрепляет заказ за отправщиком (claimed_by).
 */
export async function executeStartCollecting(
  supabase: Supabase,
  order: OrderForAction,
  shipperId: string
): Promise<ActionResult> {
  if (order.status !== "paid") {
    return { success: false, error: "Заказ можно взять в работу только из статуса «оплачен»." };
  }

  const now = new Date().toISOString();
  let query = supabase
    .from("orders")
    .update({
      status: "collecting",
      claimed_by: shipperId,
      claimed_at: now,
      status_history: appendStatusHistory(order.status_history, "collecting"),
    })
    .eq("id", order.id)
    .eq("status", "paid"); // optimistic-lock против гонки между двумя shipper'ами

  // Атомарная защита: только если ещё не закреплён.
  if (!order.claimed_by) {
    query = query.is("claimed_by", null);
  } else if (order.claimed_by !== shipperId) {
    return { success: false, error: "Заказ уже взят другим отправщиком" };
  }

  const { error, count } = await query.select("id");

  if (error) return { success: false, error: error.message };
  if (count === 0) return { success: false, error: "Заказ уже взят другим отправщиком" };

  // Инкремент shipper_stats.orders_taken для KPI «процент успешных отправок»
  // в карточке отправщика. Идемпотентность тут не строгая — повторный взятый
  // того же заказа этим shipper'ом не происходит, потому что after UPDATE
  // order.claimed_by уже выставлен и optimistic-lock на paid не пропустит.
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .rpc("increment_shipper_orders_taken", {
      p_shipper_id: shipperId,
      p_date: today,
    })
    .then((r) => {
      if (r.error) console.error("[shipper-actions] increment_shipper_orders_taken:", r.error);
    });

  if (order.customer_id) {
    notifyCustomerOrderCollecting({
      customerId: order.customer_id,
      orderId: order.id,
      orderNumber: order.order_number,
    }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderCollecting failed:", e));
  }

  return { success: true };
}

/**
 * mark_printed: фиксирует факт печати стикера в collecting.
 * Статус не меняется — печать стикера это внутрянка отправщика. Заказ
 * остаётся в collecting и в полночь МСК (если до этого момента не дошёл
 * до sent) откатится обратно в paid через daily-shipper-cleanup.
 *
 * Используется shipper-PWA для пометки «стикер напечатан» (для аналитики
 * и UI-индикации внутри карточки заказа). Можно вызывать многократно —
 * перезаписывает barcode_printed_at на каждый вызов.
 */
export async function executeMarkPrinted(
  supabase: Supabase,
  order: OrderForAction,
  shipperId: string
): Promise<ActionResult> {
  if (order.status !== "collecting") {
    return { success: false, error: "Отметить печать стикера можно только в статусе «в сборке»." };
  }

  if (order.claimed_by && order.claimed_by !== shipperId) {
    return { success: false, error: "Заказ закреплён за другим отправщиком" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      barcode_printed: true,
      barcode_printed_at: now,
      claimed_by: shipperId,
    })
    .eq("id", order.id)
    .eq("status", "collecting");

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/** @deprecated alias для backwards compat — теперь executeStartCollecting. */
export const executePrintBarcode = executeStartCollecting;

/** mark_problem: → problem (или сразу → cancelled, если возврата нет).
 *
 * Канон §11.2 (2026-05-26): отправщик выбирает scope.
 *   - "single" — только текущий заказ.
 *   - "all"    — каскад: все остальные active заказы на тот же
 *     product_size_id тоже идут в problem-flow (общая FIFO-привязка
 *     возвратов).
 * В обоих режимах out_of_stock размер обнуляется на продажу
 * (current_quantity=0).
 *
 * Если для problem-заказа нет подходящего возврата на ПВЗ
 * (expected_return_date <= send_by) — заказ моментально отменяется
 * с refund'ом (canon §11.2: «нет смысла держать в problem, если
 * возврат не приедет вовремя»).
 *
 * bad_barcode каскад не использует — это про трек конкретного заказа,
 * не про расхождение склада.
 */
export async function executeMarkProblem(
  supabase: Supabase,
  order: OrderForAction,
  options: {
    problemType?: "out_of_stock" | "bad_barcode";
    shipperId?: string;
    scope?: "single" | "all";
  }
): Promise<ActionResult> {
  if (!order.status || !["paid", "collecting"].includes(order.status)) {
    return { success: false, error: "Нельзя пометить проблему для этого статуса" };
  }

  if (order.claimed_by && options.shipperId && order.claimed_by !== options.shipperId) {
    return { success: false, error: "Заказ закреплён за другим отправщиком" };
  }

  const validationError = tryValidateTransition(order.status, "problem");
  if (validationError) return { success: false, error: validationError };

  const { problemType, shipperId } = options;
  const scope = options.scope ?? "single";

  // bad_barcode — простая ветка без поиска возврата и без каскада.
  if (problemType === "bad_barcode") {
    // ТЗ Авито-заказы §11.3 + §15.6: трек у Авито-заказа — наш собственный
    // (сгенерированный из delivery_details API). Если он не сканируется,
    // проблема не у покупателя (его в нашем боте нет, и трек не он
    // отправлял) — это сбой нашего стикера. Текст и flow отличаются от
    // дроп-ветки: клиента-покупателя НЕ дёргаем, пишем владельцу/директору
    // через order_problem route — стикер надо перевыпустить через Avito-кабинет.
    const isAvito = order.source === "avito";
    const updateFields: Record<string, unknown> = {
      status: "problem",
      problem_type: "bad_barcode",
      system_comment: isAvito
        ? "Avito-стикер не сканируется на ПВЗ — нужен новый из кабинета Авито"
        : "Трек не сканируется на ПВЗ — ждём новый от клиента",
      status_history: appendStatusHistory(order.status_history, "problem"),
    };
    if (shipperId && !order.claimed_by) {
      updateFields.claimed_by = shipperId;
      updateFields.claimed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("orders").update(updateFields).eq("id", order.id);
    if (error) return { success: false, error: error.message };

    if (isAvito) {
      // DM владельцу/директору — клиента в боте нет.
      sendByRoute({
        routeKey: "order_problem",
        message:
          `⚠️ <b>Avito-заказ №${order.order_number}</b>\n\n` +
          `Стикер не сканируется на ПВЗ. Перевыпусти этикетку через Avito-кабинет ` +
          `(заказ <code>${order.avito_order_id ?? "?"}</code>).`,
      }).catch((e) => console.error("[shipper-actions] avito bad_barcode DM failed:", e));
    } else if (order.customer_id) {
      notifyCustomerOrderProblem({
        customerId: order.customer_id,
        orderId: order.id,
        orderNumber: order.order_number,
        problemType: "bad_barcode",
        trackingNumber: order.tracking_number ?? null,
      }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderProblem failed:", e));
    }
    return { success: true };
  }

  // out_of_stock — основная ветка.
  if (problemType !== "out_of_stock") {
    return { success: false, error: "Неизвестный тип проблемы" };
  }

  // 1. Собираем список заказов для обработки: основной (всегда) + каскад
  //    при scope=all (все остальные active на этот product_size_id).
  //    Partner-isolation: каскад ТОЛЬКО внутри одного источника
  //    (NULL ↔ NULL для owner-source, X ↔ X для конкретного партнёра).
  //    De-facto это уже гарантировано через product_size_id (один товар =
  //    один источник), но явный guard защищает от будущих data-inconsistency.
  const ordersToProcess: OrderForAction[] = [order];
  if (scope === "all" && order.product_size_id) {
    let siblingsQuery = supabase
      .from("orders")
      .select(
        "id, status, status_history, order_number, product_size_id, product_id, customer_id, " +
          "client_price, is_paid, tracking_number, delivery_service, avito_order_id, " +
          "shipped_at, send_by, barcode_printed, linked_return_order_id, problem_type, " +
          "system_comment, expected_return_date, claimed_by, claimed_at, partner_id, source"
      )
      .eq("product_size_id", order.product_size_id)
      .neq("id", order.id)
      .in("status", ["paid", "collecting"]);

    siblingsQuery = order.partner_id
      ? siblingsQuery.eq("partner_id", order.partner_id)
      : siblingsQuery.is("partner_id", null);

    const { data: siblings } = await siblingsQuery;

    if (siblings && siblings.length > 0) {
      ordersToProcess.push(...(siblings as unknown as OrderForAction[]));
    }
  }

  // 2. FIFO по send_by — самым горящим возвраты достаются первыми.
  ordersToProcess.sort((a, b) => (a.send_by ?? "").localeCompare(b.send_by ?? ""));

  // 3. Один запрос — все return-возвраты на этот размер, плюс уже
  //    занятые (linked) кем-то ранее. Partner-isolation: возвраты
  //    выбираются строго внутри одного источника (partner_id match).
  const today = new Date().toISOString().split("T")[0];
  const candidateReturns = order.product_size_id
    ? await fetchAvailableReturnsForSize(supabase, order.product_size_id, order.partner_id)
    : [];

  // 4. Обрабатываем по очереди, выделяя возвраты FIFO.
  //
  // Правило подбора (BUSINESS_LOGIC §11.1 + §15.6):
  // - Дроп-возврат (expected_return_date IS NULL) → берём today.
  // - Avito-возврат (return_in_transit, expected_return_date известна) →
  //   `expected_return_date <= send_by − 1 день`. День-в-день не годится
  //   — отправщик не успеет.
  // - Возврат уже в `return` со статусом «уже на ПВЗ» (effective <= today) — fast-path.
  const ONE_DAY_MS = 24 * 3600 * 1000;
  const usedReturnIds = new Set<string>();
  for (const o of ordersToProcess) {
    const sendByDate = o.send_by ?? today;
    const matching = candidateReturns.find((r) => {
      if (usedReturnIds.has(r.id)) return false;
      // Drop / уже-на-ПВЗ ветка: NULL = today.
      if (r.expected_return_date == null) return today <= sendByDate;
      // Avito-ветка: -1 день буфер.
      const effective = new Date(
        new Date(r.expected_return_date).getTime() + ONE_DAY_MS
      )
        .toISOString()
        .slice(0, 10);
      return effective <= sendByDate;
    });

    if (matching) {
      usedReturnIds.add(matching.id);
      const arrival = matching.expected_return_date ?? today;
      const sysComment =
        arrival <= today
          ? `Возврат заказа №${matching.order_number} уже на ПВЗ — забери для отправки`
          : `Размер для отправки придёт с возврата заказа №${matching.order_number} ` +
            `(ожидается ${new Date(arrival).toLocaleDateString("ru-RU")})`;

      const updateFields: Record<string, unknown> = {
        status: "problem",
        problem_type: "out_of_stock",
        linked_return_order_id: matching.id,
        system_comment: sysComment,
        status_history: appendStatusHistory(o.status_history, "problem"),
      };
      // claimed_by ставим только для основного заказа (того, кого реально
      // отправщик трогает). Каскадные — без claimed_by, как «системные».
      if (o.id === order.id && shipperId && !o.claimed_by) {
        updateFields.claimed_by = shipperId;
        updateFields.claimed_at = new Date().toISOString();
      }
      // Race-guard: за время между SELECT siblings и UPDATE статус мог
      // уйти (другой shipper отгрузил / клиент отменил). Для siblings
      // пропускаем; для основного заказа — статус уже верифицирован выше.
      const updateQuery =
        o.id === order.id
          ? supabase.from("orders").update(updateFields).eq("id", o.id)
          : supabase
              .from("orders")
              .update(updateFields)
              .eq("id", o.id)
              .in("status", ["paid", "collecting"]);
      const { error } = await updateQuery;
      if (error) {
        console.error(`[shipper-actions] mark-problem update failed for ${o.id}:`, error);
        if (o.id === order.id) return { success: false, error: error.message };
        continue;
      }

      if (o.customer_id) {
        notifyCustomerOrderProblem({
          customerId: o.customer_id,
          orderId: o.id,
          orderNumber: o.order_number,
          problemType: "out_of_stock",
          trackingNumber: o.tracking_number ?? null,
        }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderProblem failed:", e));
      }
    } else {
      // Возврата нет → моментальная отмена + refund (если оплачен).
      await cancelOrderNoReturn(supabase, o);
    }
  }

  // 5. Обнуляем размер на продажу — он сейчас расходится со складом.
  if (order.product_size_id) {
    await supabase
      .from("product_sizes")
      .update({ current_quantity: 0 })
      .eq("id", order.product_size_id)
      .gt("current_quantity", 0);
  }

  // 6. DM владельцу (одно уведомление — отправщик трогал один size).
  if (order.product_size_id && order.product_id) {
    notifyOwnerStockMismatch({
      orderNumber: order.order_number,
      productSizeId: order.product_size_id,
      productId: order.product_id,
    }).catch((notifyError) =>
      console.error("[shipper-actions] notifyOwnerStockMismatch failed:", notifyError)
    );
  }

  return { success: true };
}

/** Доступные возвраты на этот размер, минус уже linked'ы другими problem-заказами.
 *  Partner-isolation: NULL ↔ NULL для owner-source, X ↔ X для партнёра.
 *
 *  ТЗ Авито-заказы §9.1 + §15.6: для Avito-возвратов включаем
 *  status='return_in_transit' (возврат в пути с известной
 *  expected_return_date). Фильтр по дате (`expected_return_date <=
 *  send_by - 1`) применяется в caller'е (executeMarkProblem). */
async function fetchAvailableReturnsForSize(
  supabase: Supabase,
  productSizeId: string,
  partnerId: string | null
): Promise<Array<{ id: string; order_number: number; expected_return_date: string | null }>> {
  let returnsQuery = supabase
    .from("orders")
    .select("id, order_number, expected_return_date")
    .eq("product_size_id", productSizeId)
    .in("status", ["return", "return_in_transit"])
    .order("expected_return_date", { ascending: true, nullsFirst: true });

  returnsQuery = partnerId
    ? returnsQuery.eq("partner_id", partnerId)
    : returnsQuery.is("partner_id", null);

  const { data: returns } = await returnsQuery;

  if (!returns || returns.length === 0) return [];

  const returnIds = returns.map((r) => r.id);
  const { data: alreadyLinked } = await supabase
    .from("orders")
    .select("linked_return_order_id")
    .in("linked_return_order_id", returnIds)
    .eq("status", "problem")
    .eq("problem_type", "out_of_stock");

  const linkedSet = new Set((alreadyLinked || []).map((o) => o.linked_return_order_id));
  return returns.filter((r) => !linkedSet.has(r.id));
}

/** Моментальная отмена problem-заказа когда возврата на ПВЗ нет/не успеет.
 *  Канон §11.2: refund по канону §9.2 — owner-source кредитит баланс,
 *  partner-source триггерит DM партнёру + клиенту с контактами. */
async function cancelOrderNoReturn(supabase: Supabase, order: OrderForAction): Promise<void> {
  const now = new Date().toISOString();
  // Race-guard: для cascade siblings статус мог уйти за время между
  // SELECT и UPDATE. Гард делает попытку отмены no-op для уже-неактивных.
  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancel_reason: "out_of_stock_no_return",
      status_history: appendStatusHistory(order.status_history, "cancelled", {
        from: order.status,
        reason: "out_of_stock_no_return",
      }),
    })
    .eq("id", order.id)
    .in("status", ["paid", "collecting"]);

  if (error) {
    console.error(`[shipper-actions] cancelOrderNoReturn update failed for ${order.id}:`, error);
    return;
  }

  safeCancelOrderJobs(order.id);

  if (!order.customer_id) return;

  if (order.is_paid && order.client_price > 0) {
    if (order.partner_id) {
      // Партнёрский: партнёр сам возвращает напрямую.
      const ctx = await resolvePartnerRefundContext(supabase, order.partner_id, order.customer_id);
      if (ctx) {
        notifyCustomerOrderCancelled({
          customerId: order.customer_id,
          orderId: order.id,
          orderNumber: order.order_number,
          reason: "товара нет на складе, возврата вовремя не ожидается",
          partnerRefund: {
            partnerLabel: ctx.partnerLabel,
            supportUsername: ctx.supportUsername,
            amount: order.client_price,
          },
        }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderCancelled failed:", e));
        notifyPartnerOrderRefundDue({
          partnerId: order.partner_id,
          orderNumber: order.order_number,
          amount: order.client_price,
          customerLabel: ctx.customerLabel,
          supportUsername: ctx.supportUsername,
          kind: "cancelled",
        }).catch((e) => console.error("[shipper-actions] notifyPartnerOrderRefundDue failed:", e));
      } else {
        notifyCustomerOrderCancelled({
          customerId: order.customer_id,
          orderId: order.id,
          orderNumber: order.order_number,
          reason: "товара нет на складе, возврата вовремя не ожидается",
        }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderCancelled failed:", e));
      }
    } else {
      // Owner-source: возврат на баланс.
      const { error: creditError } = await supabase.rpc("credit_customer_for_order", {
        p_customer_id: order.customer_id,
        p_amount: order.client_price,
        p_order_id: order.id,
        p_reason: "out_of_stock_no_return",
      });
      if (creditError) {
        console.error("[shipper-actions] credit_customer_for_order failed:", creditError);
      }
      notifyCustomerOrderCancelled({
        customerId: order.customer_id,
        orderId: order.id,
        orderNumber: order.order_number,
        reason:
          "товара нет на складе, возврата вовремя не ожидается. Деньги вернулись на твой баланс.",
      }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderCancelled failed:", e));
    }
  } else {
    // Не оплачен (legacy is_paid=false / +ВАЙБ-долг): освобождаем резерв.
    if (order.product_size_id) {
      await supabase
        .rpc("decrement_reserved_quantity", { size_id: order.product_size_id })
        .then((r) => {
          if (r.error)
            console.error("[shipper-actions] decrement_reserved_quantity failed:", r.error);
        });
    }
    notifyCustomerOrderCancelled({
      customerId: order.customer_id,
      orderId: order.id,
      orderNumber: order.order_number,
      reason: "товара нет на складе, возврата вовремя не ожидается",
    }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderCancelled failed:", e));
  }
}

/**
 * mark_sent: collecting → sent (BUSINESS_LOGIC §4.4 «Сдал в ПВЗ»).
 * Финальный успешный статус — заказ закрыт (Track.global нет).
 */
export async function executeShip(
  supabase: Supabase,
  order: OrderForAction,
  options: { shipperId: string; pickupPointId?: string; skipStats?: boolean }
): Promise<ActionResult> {
  if (order.status !== "collecting") {
    return {
      success: false,
      error: "Сдать в ПВЗ можно только заказ в работе («в сборке»).",
    };
  }

  if (order.claimed_by && order.claimed_by !== options.shipperId) {
    return { success: false, error: "Заказ закреплён за другим отправщиком" };
  }

  const validationError = tryValidateTransition(order.status, "sent");
  if (validationError) return { success: false, error: validationError };

  const now = new Date().toISOString();

  // shipper_rate_snapshot заполняет БД-триггер orders_snapshot_shipper_rate
  // (BEFORE UPDATE OF status, миграция ..140): ставка «на сейчас» по
  // режиму выплат (§9.4/§9.5). Единый источник правды для всех путей
  // отгрузки (executeShip / batch / owner-manual) — здесь не трогаем.
  const updateData: Record<string, unknown> = {
    status: "sent",
    shipped_at: now,
    shipped_by: options.shipperId,
    claimed_by: options.shipperId,
    claimed_at: order.claimed_at || now,
    status_history: appendStatusHistory(order.status_history, "sent"),
  };

  // Канон ПВЗ — снимок адреса (без FK): резолвим выбранный пункт из
  // справочника pickup_points в текстовый снимок. Снимок устойчив к
  // последующему удалению/правке адреса в справочнике (история не ломается).
  if (options.pickupPointId) {
    updateData.pickup_point_id = options.pickupPointId; // нестрогая ссылка
    const { data: pp } = await supabase
      .from("pickup_points")
      .select("delivery_service, address")
      .eq("id", options.pickupPointId)
      .maybeSingle();
    if (pp) {
      updateData.pickup_point_label_snapshot =
        DELIVERY_SERVICE_LABELS[pp.delivery_service] ?? pp.delivery_service;
      // address уже полный человекочитаемый адрес (как в модалке выбора ПВЗ).
      updateData.pickup_point_address_snapshot = pp.address;
    }
  }

  const { error } = await supabase.from("orders").update(updateData).eq("id", order.id);
  if (error) return { success: false, error: error.message };

  // Decrement actual_quantity (shipper's physical count)
  await adjustActualStock(supabase, order, -1);

  // Cancel scheduled jobs (non-blocking with timeout)
  safeCancelOrderJobs(order.id);

  // Stats (skipped in batch — aggregated separately)
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: today,
      p_field: "orders_shipped",
      p_delta: 1,
    });
  }

  // Notify customer about shipment (Stage 3.6, fire-and-forget).
  if (order.customer_id) {
    notifyCustomerOrderShipped({
      customerId: order.customer_id,
      orderId: order.id,
      orderNumber: order.order_number,
      trackingNumber: order.tracking_number,
      deliveryService: order.delivery_service,
    }).catch((e) => console.error("[shipper-actions] notify customer shipped failed:", e));
  }

  // Stage 3.7: edit summary в супергруппе.
  buildSummaryFromOrderId(order.id)
    .then((summary) => (summary ? editOrderSummary(summary) : undefined))
    .catch((e) => console.error("[shipper-actions] editOrderSummary (ship) failed:", e));

  // Avito reverse-sync снят: B2B-коробка работает только с клиентами оптовика,
  // не выгружаем треки в Avito API. Этап 9 вернёт интеграцию.

  return { success: true };
}

/** complete_return: return_arrived → return_completed */
export async function executeCompleteReturn(
  supabase: Supabase,
  order: OrderForAction,
  options: { shipperId: string; skipStats?: boolean }
): Promise<ActionResult> {
  if (order.status !== "return") {
    return { success: false, error: "Возврат ещё не прибыл" };
  }

  const validationError = tryValidateTransition(order.status, "return_done");
  if (validationError) return { success: false, error: validationError };

  // 1. Update status first
  const { error } = await supabase
    .from("orders")
    .update({
      status: "return_done",
      return_completed_at: new Date().toISOString(),
      return_completed_by: options.shipperId,
      status_history: appendStatusHistory(order.status_history, "return_done"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // 2. Side-effects: stock + balance refund.
  try {
    await restoreStock(supabase, order);
  } catch (sideEffectError) {
    console.error("[shipper-actions] complete_return side-effect error:", sideEffectError);
  }

  // Cancel move-to-trash timer (non-blocking)
  fireBullMQ(() => cancelMoveToTrash(order.id), "cancelMoveToTrash");

  // Финансовая ветка: партнёрский vs owner.
  //   • owner-source оплаченный → credit_customer_for_order (RPC идемпотентна).
  //   • partner-source оплаченный → credit НЕ зовём, партнёр сам возвращает.
  //     DM клиенту с контактом партнёра + поддержки, DM партнёру с контактом
  //     клиента + поддержки.
  const isPartnerOrder = !!order.partner_id;
  if (order.is_paid && order.customer_id && order.client_price > 0 && !isPartnerOrder) {
    const { error: creditError } = await supabase.rpc("credit_customer_for_order", {
      p_customer_id: order.customer_id,
      p_amount: order.client_price,
      p_order_id: order.id,
      p_reason: "return_done",
    });
    if (creditError) {
      console.error("[shipper-actions] credit_customer_for_order failed:", creditError);
    }
  }

  // DM клиенту: «возврат принят». Текст ветвится в notifyCustomerOrderReturnPickedUp.
  if (order.customer_id) {
    void sendReturnPickedUpDms(supabase, order, isPartnerOrder);
  }

  // Stats (skipped in batch — aggregated separately)
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: today,
      p_field: "returns_collected",
      p_delta: 1,
    });
  }

  // Возобновление problem-заказов на этот SKU+размер.
  // Единый путь — через job `auto-resume-problem` (FIFO по send_by, перевод
  // в `collecting`, очистка problem_type, system_comment-подсказка с номером
  // возврата, DM отправщику). Inline-цикл удалён — он восстанавливал в `paid`
  // вместо `collecting` и не уведомлял отправщика. См. BUSINESS_LOGIC §11.3.
  if (order.product_size_id) {
    scheduleAutoResumeProblem(order.product_size_id, order.id).catch((e) =>
      console.error("[shipper-actions] scheduleAutoResumeProblem failed:", e)
    );
  }

  return { success: true };
}

/** dispute_return: return_arrived → return_completed (no deposit refund) */
export async function executeDisputeReturn(
  supabase: Supabase,
  order: OrderForAction,
  options: {
    shipperId: string;
    /** Массив base64 dataURL ('data:image/jpeg;base64,…') от модала. ≥3 обязательно. */
    disputePhotos: string[];
    /** Описание проблемы. Обязательно. */
    disputeReason: string;
    skipStats?: boolean;
  }
): Promise<ActionResult> {
  if (order.status !== "return") {
    return { success: false, error: "Возврат ещё не прибыл" };
  }

  if (!options.disputePhotos || options.disputePhotos.length < 3) {
    return { success: false, error: "Нужно минимум 3 фотографии" };
  }

  if (options.disputePhotos.length > 5) {
    return { success: false, error: "Максимум 5 фотографий" };
  }

  if (!options.disputeReason || options.disputeReason.trim().length < 5) {
    return { success: false, error: "Опишите проблему (минимум 5 символов)" };
  }

  const validationError = tryValidateTransition(order.status, "return_done");
  if (validationError) return { success: false, error: validationError };

  // 1. Загружаем фото в Storage bucket dispute-photos.
  const photoUrls: string[] = [];
  for (let i = 0; i < options.disputePhotos.length; i++) {
    const dataUrl = options.disputePhotos[i];
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return { success: false, error: `Фото ${i + 1}: неверный формат (ожидаем base64 dataURL)` };
    }
    const [, mime, b64] = match;
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const buffer = Buffer.from(b64, "base64");
    const path = `${order.id}/${Date.now()}-${i}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("dispute-photos")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) {
      console.error(`[shipper-actions] dispute photo upload failed (#${i}):`, upErr);
      return { success: false, error: `Не удалось загрузить фото ${i + 1}: ${upErr.message}` };
    }

    const { data: urlData } = supabase.storage.from("dispute-photos").getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  // 2. Update status. Товар на склад НЕ возвращается (брак — иначе плохой
  //    товар окажется в продаже). fault_party='client' / fault_reason='bad_quality'.
  const reasonText = options.disputeReason.trim();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "return_done",
      return_completed_at: new Date().toISOString(),
      return_completed_by: options.shipperId,
      fault_party: "client",
      fault_reason: "bad_quality",
      dispute_photos: photoUrls,
      dispute_reason: reasonText,
      system_comment: `quality_dispute: ${reasonText}`,
      status_history: appendStatusHistory(order.status_history, "return_done", {
        fault_reason: "bad_quality",
      }),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // 3. Cancel move-to-trash timer (non-blocking).
  fireBullMQ(() => cancelMoveToTrash(order.id), "cancelMoveToTrash");

  // 4. DM клиенту с media-group + инструкцией про Авито-поддержку.
  if (order.customer_id) {
    notifyCustomerOrderQualityIssue({
      customerId: order.customer_id,
      orderId: order.id,
      orderNumber: order.order_number,
      reason: reasonText,
      photoUrls,
    }).catch((e) => console.error("[shipper-actions] notifyCustomerOrderQualityIssue failed:", e));
  }

  // 5. Stats — KPI отправщика (returns_collected = факт работы на ПВЗ,
  //    не зависит от исхода).
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: today,
      p_field: "returns_collected",
      p_delta: 1,
    });
  }

  return { success: true };
}

/** start_return: not_picked_up → return_in_transit */
export async function executeStartReturn(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "not_picked_up") {
    return { success: false, error: "Начать возврат можно только для заказа «Не забрали»" };
  }

  const validationError = tryValidateTransition(order.status, "return");
  if (validationError) return { success: false, error: validationError };

  const expectedReturn = new Date();
  expectedReturn.setDate(expectedReturn.getDate() + 14);

  const { error } = await supabase
    .from("orders")
    .update({
      status: "return",
      status_history: appendStatusHistory(order.status_history, "return"),
      expected_return_date: expectedReturn.toISOString(),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Phase B: scheduleReturnArrived снят (Track.global). Phase D переведёт return-flow
  // на pickup_by + expire-pickup-by job.
  void expectedReturn;

  return { success: true };
}

/** mark_return_arrived: return_in_transit → return_arrived (manual) */
export async function executeMarkReturnArrived(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "return") {
    return { success: false, error: "Отметить прибытие можно только для возврата в пути" };
  }

  const validationError = tryValidateTransition(order.status, "return");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "return",
      status_history: appendStatusHistory(order.status_history, "return"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Cancel the scheduled auto-transition job
  safeCancelOrderJobs(order.id);

  return { success: true };
}

/** set_size: set size for Avito orders without size */
export async function executeSetSize(
  supabase: Supabase,
  order: OrderForAction,
  options: { size: string; productSizeId: string }
): Promise<ActionResult> {
  if (!order.status || !["paid", "problem"].includes(order.status)) {
    return {
      success: false,
      error:
        "Установить размер можно только для заказа в статусе «Ожидает отправки» или «Проблема»",
    };
  }

  if (!options.size || !options.productSizeId) {
    return { success: false, error: "Укажите размер и product_size_id" };
  }

  // If order already had a size — restore old size quantity
  if (order.product_size_id) {
    try {
      await supabase.rpc("increment_product_size_quantity", {
        size_id: order.product_size_id,
        amount: 1,
      });
    } catch (restoreError) {
      console.error("[shipper-actions] set_size restore old size error:", restoreError);
    }
  }

  // Update order
  const { error } = await supabase
    .from("orders")
    .update({
      size: options.size,
      product_size_id: options.productSizeId,
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Decrement new size quantity
  try {
    const { data: sizeData } = await supabase
      .from("product_sizes")
      .select("current_quantity")
      .eq("id", options.productSizeId)
      .single();

    if (sizeData && sizeData.current_quantity > 0) {
      await supabase
        .from("product_sizes")
        .update({ current_quantity: sizeData.current_quantity - 1 })
        .eq("id", options.productSizeId);
    }
  } catch (decrementError) {
    console.error("[shipper-actions] set_size decrement error:", decrementError);
  }

  return { success: true };
}

/** cancel_order: paid → cancelled (BUSINESS_LOGIC §4.4) */
export async function executeCancelOrder(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "paid") {
    return { success: false, error: "Отменить можно только заказ в статусе «Ожидает отправки»" };
  }

  const validationError = tryValidateTransition(order.status, "cancelled");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "shipper_manual",
      status_history: appendStatusHistory(order.status_history, "cancelled"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Restore stock
  try {
    await restoreStock(supabase, order);
  } catch (sideEffectError) {
    console.error("[shipper-actions] cancel_order stock restore error:", sideEffectError);
  }

  // Cancel BullMQ jobs (non-blocking with timeout)
  safeCancelOrderJobs(order.id);

  // ТЗ Авито-заказы §9.2 / §15.9: Avito-сторона должна узнать про отмену
  // через её API (cancel-endpoint), чтобы вернуть деньги покупателю и
  // закрыть заказ в кабинете. До подтверждения endpoint'а пробой —
  // gate'им feature-flag'ом AVITO_API_CANCEL_ENABLED. fire-and-forget.
  if (order.source === "avito" && order.avito_order_id) {
    void cancelAvitoOrderViaApi({
      orderId: order.id,
      avitoOrderId: order.avito_order_id,
      reason: "shipper_manual",
    }).catch((e) => console.error("[shipper-actions] avito cancel API failed:", e));
  }

  // Refund на customer_balance (BUSINESS_LOGIC §9.2). Только для
  // owner-source оплаченных заказов: партнёрские деньги возвращает партнёр,
  // не платформа. RPC идемпотентна по (order_id, reason).
  const isPartnerOrder = !!order.partner_id;
  if (order.is_paid && order.customer_id && order.client_price > 0 && !isPartnerOrder) {
    const { error: creditError } = await supabase.rpc("credit_customer_for_order", {
      p_customer_id: order.customer_id,
      p_amount: order.client_price,
      p_order_id: order.id,
      p_reason: "cancelled_before_ship",
    });
    if (creditError) {
      console.error("[shipper-actions] credit_customer_for_order (cancel) failed:", creditError);
    }
  }

  // Notify customer about cancellation (Stage 3.6).
  if (order.customer_id) {
    notifyCustomerOrderCancelled({
      customerId: order.customer_id,
      orderId: order.id,
      orderNumber: order.order_number,
      reason: null,
    }).catch((e) => console.error("[shipper-actions] notify customer cancelled failed:", e));
  }

  // Stage 3.7: edit summary в супергруппе.
  buildSummaryFromOrderId(order.id)
    .then((summary) => (summary ? editOrderSummary(summary) : undefined))
    .catch((e) => console.error("[shipper-actions] editOrderSummary (cancel) failed:", e));

  return { success: true };
}

/**
 * undo_print: collecting → paid. Отменить взятие в работу, сбросить флаг печати,
 * вернуть заказ в общий пул для других отправщиков.
 */
export async function executeUndoPrint(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "collecting") {
    return {
      success: false,
      error: "Отменить взятие можно только для заказа в работе («в сборке»)",
    };
  }

  const validationError = tryValidateTransition(order.status, "paid");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "paid",
      barcode_printed: false,
      barcode_printed_at: null,
      claimed_by: null,
      claimed_at: null,
      status_history: appendStatusHistory(order.status_history, "paid"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** undo_ship: in_transit → collecting */
export async function executeUndoShip(
  supabase: Supabase,
  order: OrderForAction,
  options: { shipperId: string; skipStats?: boolean }
): Promise<ActionResult> {
  if (order.status !== "sent") {
    return { success: false, error: "Отменить отправку можно только для заказа «В пути»" };
  }

  const validationError = tryValidateTransition(order.status, "collecting");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "collecting",
      shipped_at: null,
      shipped_by: null,
      pickup_point_id: null,
      pickup_point_label_snapshot: null,
      pickup_point_address_snapshot: null,
      status_history: appendStatusHistory(order.status_history, "collecting"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Rollback stats for the date the order was shipped
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    const shippedDate = order.shipped_at
      ? new Date(order.shipped_at).toISOString().split("T")[0]
      : today;

    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: shippedDate,
      p_field: "orders_shipped",
      p_delta: -1,
    });
  }

  return { success: true };
}

/** undo_problem: problem → previous status (collecting or paid) */
export async function executeUndoProblem(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "problem") {
    return { success: false, error: "Вернуть можно только заказ в статусе «Проблема»" };
  }

  const history = (order.status_history || []) as Array<{
    status: string;
    timestamp: string;
  }>;
  const previousEntry = history.length >= 2 ? history[history.length - 2] : null;
  const targetStatus = previousEntry?.status === "collecting" ? "collecting" : "paid";

  const validationError = tryValidateTransition(order.status, targetStatus as OrderStatus);
  if (validationError) return { success: false, error: validationError };

  const updateData: Record<string, unknown> = {
    status: targetStatus,
    problem_type: null,
    linked_return_order_id: null,
    system_comment: null,
    status_history: appendStatusHistory(order.status_history, targetStatus),
  };

  // Снимаем claim при возврате в общий пул
  if (targetStatus === "paid") {
    updateData.claimed_by = null;
    updateData.claimed_at = null;
  }

  const { error } = await supabase.from("orders").update(updateData).eq("id", order.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

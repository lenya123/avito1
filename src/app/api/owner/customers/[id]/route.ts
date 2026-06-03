import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { aggregateOwnerFinance } from "@/lib/finance/owner-revenue";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().max(255).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  vibeEnabled: z.boolean().optional(),
  vibeCreditLimitOverride: z.number().min(0).max(10_000_000).nullable().optional(),
  isBlocked: z.boolean().optional(),
  blockedReason: z.string().max(1000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  // is_frozen/frozen_at НЕЛЬЗЯ менять PATCH-ом — только триггер (Stage 2.3).
});

// GET /api/owner/customers/[id] — детали клиента + долг + последние заказы.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const supabase = createServiceClient();

    const { data: customer, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !customer) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }

    const [
      { data: debtRow },
      { data: bs },
      { data: allOrders },
      { data: recentOrders },
      { data: pendingVibePaymentsData },
      { data: balanceHistoryData },
      { data: debtByRecipientData },
    ] = await Promise.all([
      supabase.from("customer_vibe_debt").select("debt").eq("customer_id", id).maybeSingle(),
      supabase.from("business_settings").select("vibe_credit_default_limit").limit(1).maybeSingle(),
      // Агрегат stats — все заказы клиента (поля для канона §9.3/§9.4).
      supabase
        .from("orders")
        .select(
          "id, status, fault_reason, client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot"
        )
        .eq("customer_id", id),
      // Последние 10 заказов с товаром — для блока «Последние заказы».
      supabase
        .from("orders")
        .select(
          "id, order_number, status, client_price, is_paid, created_at, send_by, product_id, product:products(id, name, photo_urls)"
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      // Неподтверждённые vibe-платежи (для UI ручного confirm/reject).
      supabase
        .from("vibe_payments")
        .select(
          "id, amount, receipt_recognized_text, receipt_file_url, received_at, payment_method_id"
        )
        .eq("customer_id", id)
        .is("confirmed_at", null)
        .order("received_at", { ascending: false }),
      // Последние 5 движений customer_balance — превью секции «История».
      // Полная история (с пагинацией) — через GET /balance-history endpoint.
      supabase
        .from("customer_balance_history")
        .select(
          "id, delta, balance_after, reason, note, created_at, order_id, withdrawal_request_id, actor_user_id, order:orders(order_number), actor:users(name, email)"
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(5),
      // Walkthrough фазы 2 пробел C: разбивка +ВАЙБ-долга по адресатам.
      // RPC возвращает строки с debt>0 в порядке убывания суммы.
      supabase.rpc("get_customer_debt_by_recipient", { p_customer_id: id }),
    ]);

    const defaultLimit = Number(bs?.vibe_credit_default_limit ?? 0);

    // Операционные счётчики (статусы §4.2). «completed» = успешно
    // доставлено (sent); returns — клиентские возвраты/сгорания.
    const orders = allOrders || [];
    let total = 0,
      completed = 0,
      cancelled = 0,
      returns = 0;
    for (const o of orders) {
      total++;
      if (o.status === "sent") completed++;
      else if (o.status === "cancelled") cancelled++;
      else if (o.status === "return" || o.status === "return_done" || o.status === "trash")
        returns++;
    }

    // Деньги — единый канон §9.3/§9.4 через общий хелпер (как на
    // Финансах/Аналитике/Дашборде/товаре): выручка по «живым» статусам,
    // партнёрский = комиссия, себестоимость своего = закупка + ставка
    // отправщика. Раньше тут был свой цикл «только sent, без партнёра/
    // ставки» — расходился с каноном (занижал и искажал).
    const fin = aggregateOwnerFinance(orders);
    const revenue = fin.revenue;
    const invested = fin.cost;
    const profit = fin.profit;
    const avgCheck = fin.count > 0 ? Math.round(fin.revenue / fin.count) : 0;
    const roi = fin.cost > 0 ? Math.round((fin.profit / fin.cost) * 100) : 0;

    return NextResponse.json({
      customer: {
        id: customer.id,
        tgUserId: customer.tg_user_id,
        telegramUsername: customer.telegram_username,
        name: customer.name,
        phone: customer.phone,
        vibeEnabled: customer.vibe_enabled,
        vibeCreditLimitOverride:
          customer.vibe_credit_limit_override != null
            ? Number(customer.vibe_credit_limit_override)
            : null,
        effectiveLimit:
          customer.vibe_credit_limit_override != null
            ? Number(customer.vibe_credit_limit_override)
            : defaultLimit,
        isFrozen: customer.is_frozen,
        frozenAt: customer.frozen_at,
        frozenReason: customer.frozen_reason,
        requiredPaymentAmount:
          customer.required_payment_amount != null
            ? Number(customer.required_payment_amount)
            : null,
        isBlocked: customer.is_blocked,
        blockedReason: customer.blocked_reason,
        notes: customer.notes,
        createdAt: customer.created_at,
        updatedAt: customer.updated_at,
        debt: Number(debtRow?.debt ?? 0),
        customerBalance: Number(customer.customer_balance ?? 0),
      },
      stats: {
        total,
        completed,
        cancelled,
        returns,
        invested,
        revenue,
        profit,
        roi,
        avgCheck,
      },
      recentOrders: (recentOrders || []).map((o) => {
        const product = o.product as {
          id: string;
          name: string;
          photo_urls: string[] | null;
        } | null;
        return {
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          clientPrice: o.client_price,
          isPaid: o.is_paid,
          createdAt: o.created_at,
          sendBy: o.send_by,
          productName: product?.name ?? null,
          productPhoto: product?.photo_urls?.[0] ?? null,
        };
      }),
      pendingVibePayments: (pendingVibePaymentsData ?? []).map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        receivedAt: p.received_at,
        recognizedText: p.receipt_recognized_text,
        receiptFileUrl: p.receipt_file_url,
        paymentMethodId: p.payment_method_id,
      })),
      debtByRecipient: (debtByRecipientData ?? []).map((row) => ({
        recipientType: row.recipient_type === "owner" ? "owner" : "partner",
        partnerId: row.partner_id,
        partnerName: row.partner_name,
        debt: Number(row.debt),
      })),
      balanceHistory: (balanceHistoryData ?? []).map((h) => {
        const order = h.order as { order_number: number } | null;
        const actor = h.actor as { name: string | null; email: string | null } | null;
        return {
          id: h.id,
          delta: Number(h.delta),
          balanceAfter: Number(h.balance_after),
          reason: h.reason,
          note: h.note,
          createdAt: h.created_at,
          orderId: h.order_id,
          orderNumber: order?.order_number ?? null,
          withdrawalRequestId: h.withdrawal_request_id,
          actorUserId: h.actor_user_id,
          actorName: actor?.name ?? actor?.email ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Customer detail API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const data = patchSchema.parse(body);

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.phone !== undefined) update.phone = data.phone;
    if (data.vibeEnabled !== undefined) update.vibe_enabled = data.vibeEnabled;
    if (data.vibeCreditLimitOverride !== undefined)
      update.vibe_credit_limit_override = data.vibeCreditLimitOverride;
    if (data.isBlocked !== undefined) update.is_blocked = data.isBlocked;
    if (data.blockedReason !== undefined) update.blocked_reason = data.blockedReason;
    if (data.notes !== undefined) update.notes = data.notes;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Нет данных" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Снимок состояния ДО изменений — нужен чтобы понять что именно поменялось
    // (vibe_enabled был выключен → включился, лимит изменился, и т.д.) и
    // отправить клиенту соответствующее уведомление.
    const { data: before } = await supabase
      .from("customers")
      .select("vibe_enabled, vibe_credit_limit_override")
      .eq("id", id)
      .single();

    // Дефолтный лимит из настроек — нужен и для текста при выдаче +ВАЙБ,
    // и для расчёта эффективного лимита при сравнении до/после.
    const { data: bs } = await supabase
      .from("business_settings")
      .select("vibe_credit_default_limit")
      .limit(1)
      .maybeSingle();
    const defaultLimit = Number(bs?.vibe_credit_default_limit ?? 0);

    const { error } = await supabase.from("customers").update(update).eq("id", id);

    if (error) {
      console.error("Customer update error:", error);
      return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
    }

    // Отправляем DM клиенту по факту изменений. Любая ошибка отправки —
    // не валит сам PATCH (логи + продолжаем).
    await notifyCustomerOfVibeChange({
      supabase,
      customerId: id,
      before: {
        vibeEnabled: !!before?.vibe_enabled,
        limitOverride:
          before?.vibe_credit_limit_override != null
            ? Number(before.vibe_credit_limit_override)
            : null,
      },
      after: {
        vibeEnabled: data.vibeEnabled !== undefined ? data.vibeEnabled : !!before?.vibe_enabled,
        limitOverride:
          data.vibeCreditLimitOverride !== undefined
            ? data.vibeCreditLimitOverride
            : before?.vibe_credit_limit_override != null
              ? Number(before.vibe_credit_limit_override)
              : null,
      },
      defaultLimit,
    }).catch((e) => console.error("[PATCH customer] vibe DM failed:", e));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Customer PATCH API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/**
 * Решает, какое уведомление отправить клиенту по результатам PATCH'а.
 * Сценарии:
 *   1. Выдача +ВАЙБ (false → true): экскурс + лимит.
 *   2. Снятие +ВАЙБ (true → false): если есть долг — заморозить с
 *      reason='vibe_revoked_with_debt' + DM с предупреждением; иначе
 *      простое DM «+ВАЙБ снят».
 *   3. Изменение лимита при vibe_enabled=true (override менялся): DM
 *      об увеличении/уменьшении.
 */
async function notifyCustomerOfVibeChange(args: {
  supabase: ReturnType<typeof createServiceClient>;
  customerId: string;
  before: { vibeEnabled: boolean; limitOverride: number | null };
  after: { vibeEnabled: boolean; limitOverride: number | null };
  defaultLimit: number;
}) {
  const { supabase, customerId, before, after, defaultLimit } = args;

  const beforeEffective = before.limitOverride != null ? before.limitOverride : defaultLimit;
  const afterEffective = after.limitOverride != null ? after.limitOverride : defaultLimit;

  // 1. Выдача +ВАЙБ (false → true).
  if (!before.vibeEnabled && after.vibeEnabled) {
    const { notifyCustomerVibeEnabled } = await import("@/lib/telegram/notifications");
    await notifyCustomerVibeEnabled({ customerId, limit: afterEffective });
    return;
  }

  // 2. Снятие +ВАЙБ (true → false).
  if (before.vibeEnabled && !after.vibeEnabled) {
    const { data: debtRow } = await supabase
      .from("customer_vibe_debt")
      .select("debt")
      .eq("customer_id", customerId)
      .maybeSingle();
    const currentDebt = Number(debtRow?.debt ?? 0);

    if (currentDebt > 0) {
      // Замораживаем с reason='vibe_revoked_with_debt' — триггер
      // check_vibe_credit_freeze в БД сам разморозит при погашении.
      await supabase
        .from("customers")
        .update({
          is_frozen: true,
          frozen_at: new Date().toISOString(),
          frozen_reason: "vibe_revoked_with_debt",
          required_payment_amount: currentDebt,
        })
        .eq("id", customerId);
    }

    const { notifyCustomerVibeDisabled } = await import("@/lib/telegram/notifications");
    await notifyCustomerVibeDisabled({ customerId, currentDebt });
    return;
  }

  // 3. Изменение лимита при активном +ВАЙБ.
  if (before.vibeEnabled && after.vibeEnabled && beforeEffective !== afterEffective) {
    const { notifyCustomerVibeLimitChanged } = await import("@/lib/telegram/notifications");
    await notifyCustomerVibeLimitChanged({
      customerId,
      oldLimit: beforeEffective,
      newLimit: afterEffective,
    });
    return;
  }
}

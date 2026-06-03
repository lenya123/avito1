import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { z } from "zod";
import { aggregateOwnerFinance, ownerRevenue } from "@/lib/finance/owner-revenue";
import { isRevenueCounted } from "@/lib/constants/pricing";
import { moscowToday } from "@/lib/utils/moscow-time";
import { notifyShipperPayoutPaid } from "@/lib/telegram/notifications";

/** GET — owner finance overview */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const days = Number(searchParams.get("days") || 30);
    // §15: фильтр канала сбыта.
    const channelRaw = searchParams.get("channel");
    const channel: "all" | "drop" | "avito" =
      channelRaw === "drop" || channelRaw === "avito" ? channelRaw : "all";

    let startDate: string;
    let endDate: string | null = null;
    if (dateFrom) {
      startDate = new Date(dateFrom).toISOString();
      endDate = dateTo ? new Date(dateTo + "T23:59:59").toISOString() : null;
    } else {
      startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Прошлый период такой же длины, вплотную до текущего — для сравнения
    // «выручка/прибыль vs предыдущие N дней».
    const startMs = new Date(startDate).getTime();
    const endMs = endDate ? new Date(endDate).getTime() : Date.now();
    const periodMs = Math.max(endMs - startMs, 24 * 60 * 60 * 1000);
    const prevStartDate = new Date(startMs - periodMs).toISOString();
    const prevEndDate = startDate;

    const supabase = createServiceClient();

    // Stage 1.5: моно-бизнес — все товары принадлежат одному владельцу,
    // фильтр по seller_id убран (колонка products.seller_id удалена).

    // Без DB-фильтра статусов: канон §9.3 шире (return/trash/problem),
    // гейт делает общий хелпер. + partner-поля для §9.4.
    let ordersQuery = supabase
      .from("orders")
      .select(
        "client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, status, fault_reason, product_id, created_at, source, avito_fee_snapshot, avito_marketing_snapshot"
      )
      .gte("created_at", startDate);
    if (endDate) ordersQuery = ordersQuery.lte("created_at", endDate);
    if (channel !== "all") ordersQuery = ordersQuery.eq("source", channel);

    let expensesQuery = supabase
      .from("expenses")
      .select("id, amount, category, description, expense_date, created_at")
      .gte("created_at", startDate);
    if (endDate) expensesQuery = expensesQuery.lte("created_at", endDate);
    expensesQuery = expensesQuery.order("created_at", { ascending: false }).limit(100);

    let payoutsQuery = supabase
      .from("shipper_payouts")
      .select("id, amount, shipper_id, note, created_at")
      .gte("created_at", startDate);
    if (endDate) payoutsQuery = payoutsQuery.lte("created_at", endDate);
    payoutsQuery = payoutsQuery.order("created_at", { ascending: false }).limit(100);

    const [
      ordersResult,
      expensesResult,
      payoutsResult,
      categoriesResult,
      productsResult,
      allCompletedResult,
      productSizesResult,
      customersResult,
      vibeDebtResult,
      prevOrdersResult,
      partnerDebtResult,
      cashOrdersResult,
      cashVibeResult,
      cashPartnerResult,
    ] = await Promise.all([
      ordersQuery,
      expensesQuery,
      payoutsQuery,

      supabase
        .from("expense_categories")
        .select("id, name, color, sort_order")
        .order("sort_order", { ascending: true }),

      supabase
        .from("products")
        .select("id, name, category, photo_urls, photo_main_index, purchase_price")
        .is("deleted_at", null),

      supabase
        .from("orders")
        .select(
          "product_id, client_price, partner_id, partner_commission_snapshot, status, fault_reason"
        ),

      supabase.from("product_sizes").select("product_id, initial_quantity"),

      // Касса (§9.2/§7.4): обязательства владельца.
      // (а) customer_balance — сколько владелец УЖЕ должен клиентам
      //     (возвраты на баланс; клиент может вывести в любой момент).
      // (б) customer_vibe_debt — сколько клиенты должны владельцу в долг
      //     (+ВАЙБ): виртуальное, на картах этих денег ещё НЕТ.
      supabase
        .from("customers")
        .select(
          "id, name, telegram_username, customer_balance, vibe_enabled, vibe_credit_limit_override"
        ),

      supabase.from("customer_vibe_debt").select("customer_id, debt"),

      // Прошлый период (для сравнения тренда) — только поля для §9.3/§9.4.
      supabase
        .from("orders")
        .select(
          "client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, status, fault_reason"
        )
        .gte("created_at", prevStartDate)
        .lt("created_at", prevEndDate),

      // Партнёрский долг владельцу (§10.4). КАНОН — та же формула, что на
      // /owner/partners: status='sent' + получены деньги от клиента + не
      // погашено. Read-only зеркало; дуал-реестр partner_owner_debts (#1)
      // здесь НЕ трогаем (это решение профильного прохода Партнёры).
      supabase
        .from("orders")
        .select("partner_commission_snapshot")
        .eq("status", "sent")
        .not("partner_payment_received_at", "is", null)
        .is("partner_commission_paid_at", null),

      // «Пришло на карту» за период — три источника реального кэш-инфлоу
      // (фильтр по СОБЫТИЮ получения, не по created_at заказа):
      //   1) свои заказы, оплаченные картой/СБП/etc. (НЕ balance/deposit) —
      //      нетто-инфлоу = client_price − applied_balance.
      //   2) +ВАЙБ-погашения owner-route (vibe_payments.confirmed_at в окне,
      //      payment_method_id NOT NULL — partner-route даёт NULL).
      //   3) Партнёр оплатил комиссию (partner_commission_paid_at в окне).
      endDate
        ? supabase
            .from("orders")
            .select("client_price, applied_balance, payment_method")
            .eq("is_paid", true)
            .gte("paid_at", startDate)
            .lte("paid_at", endDate)
        : supabase
            .from("orders")
            .select("client_price, applied_balance, payment_method")
            .eq("is_paid", true)
            .gte("paid_at", startDate),
      endDate
        ? supabase
            .from("vibe_payments")
            .select("amount")
            .not("confirmed_at", "is", null)
            .not("payment_method_id", "is", null)
            .gte("confirmed_at", startDate)
            .lte("confirmed_at", endDate)
        : supabase
            .from("vibe_payments")
            .select("amount")
            .not("confirmed_at", "is", null)
            .not("payment_method_id", "is", null)
            .gte("confirmed_at", startDate),
      endDate
        ? supabase
            .from("orders")
            .select("partner_commission_snapshot")
            .not("partner_commission_paid_at", "is", null)
            .gte("partner_commission_paid_at", startDate)
            .lte("partner_commission_paid_at", endDate)
        : supabase
            .from("orders")
            .select("partner_commission_snapshot")
            .not("partner_commission_paid_at", "is", null)
            .gte("partner_commission_paid_at", startDate),
    ]);

    const orders = ordersResult.data || [];
    // Канон §4.2: «завершён» = `sent` (для счётчика completedOrders ниже).
    const completedOrders = orders.filter((o) => o.status === "sent");

    // Выручка/себестоимость/прибыль — единый канон §9.3/§9.4 (партнёрский
    // = комиссия; БЕЗ ставки отправщика — отложено до модели выплат).
    const finTotals = aggregateOwnerFinance(orders);
    const totalRevenue = finTotals.revenue;
    const totalCost = finTotals.cost;
    const totalProfit = finTotals.profit;

    // ─── Динамика по дням (МСК) + сравнение с прошлым периодом ───
    // Тот же канон-хелпер aggregateOwnerFinance (§9.3/§9.4) — цифры
    // тренда сходятся с верхними KPI по определению.
    const byDay = new Map<string, typeof orders>();
    for (const o of orders) {
      const day = moscowToday(new Date(o.created_at as string));
      const bucket = byDay.get(day);
      if (bucket) bucket.push(o);
      else byDay.set(day, [o]);
    }
    const timeseries: Array<{
      date: string;
      label: string;
      orders: number;
      revenue: number;
      profit: number;
      invested: number;
      expenses: number;
    }> = Array.from(byDay.entries()).map(([date, dayOrders]) => {
      const agg = aggregateOwnerFinance(dayOrders);
      const parts = date.split("-");
      const label = parts.length === 3 ? `${parts[2]}.${parts[1]}` : date;
      // Формат ChartDataPoint для общего SalesChart (страница Заказов).
      // `expenses` доливается ниже после загрузки expenses-таблицы.
      return {
        date,
        label,
        orders: agg.count,
        revenue: agg.revenue,
        profit: agg.profit,
        invested: agg.cost,
        expenses: 0,
      };
    });

    const prevTotals = aggregateOwnerFinance(prevOrdersResult.data || []);
    const deltaPct = (cur: number, prev: number): number | null => {
      if (prev === 0) return cur === 0 ? 0 : null; // null = «нет базы для %»
      return Math.round(((cur - prev) / Math.abs(prev)) * 100);
    };
    const trendCompare = {
      revenue: {
        current: totalRevenue,
        previous: prevTotals.revenue,
        deltaPct: deltaPct(totalRevenue, prevTotals.revenue),
      },
      profit: {
        current: totalProfit,
        previous: prevTotals.profit,
        deltaPct: deltaPct(totalProfit, prevTotals.profit),
      },
    };

    // Партнёрский долг владельцу (§10.4) — read-only сумма, канон-формула
    // (зеркало /owner/partners). Не period-scoped: это текущий остаток.
    const partnerDebtOwed = (partnerDebtResult.data || []).reduce(
      (sum, r) => sum + Number(r.partner_commission_snapshot ?? 0),
      0
    );

    // «Пришло на карту» за период — реальный кэш-инфлоу (3 источника).
    // Свои заказы: client_price − applied_balance, но ТОЛЬКО если оплата
    // не из внутреннего баланса/+ВАЙБ-кредита (`balance`/`deposit` = не
    // живые деньги). +ВАЙБ-погашения: только owner-route (partner-route
    // даёт деньги партнёру, не владельцу).
    const cashFromOrders = (cashOrdersResult.data || [])
      .filter((o) => o.payment_method !== "balance" && o.payment_method !== "deposit")
      .reduce(
        (sum, o) => sum + Math.max(0, Number(o.client_price ?? 0) - Number(o.applied_balance ?? 0)),
        0
      );
    const cashFromVibe = (cashVibeResult.data || []).reduce(
      (sum, v) => sum + Number(v.amount ?? 0),
      0
    );
    const cashFromPartner = (cashPartnerResult.data || []).reduce(
      (sum, o) => sum + Number(o.partner_commission_snapshot ?? 0),
      0
    );
    const cashInflow = cashFromOrders + cashFromVibe + cashFromPartner;

    const expenses = expensesResult.data || [];
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);

    // ─── Заливаем expenses в timeseries по MSK-дням (метрика «Расходы») ───
    const expensesByDay = new Map<string, number>();
    for (const e of expenses) {
      const ref = (e.expense_date as string | null) ?? (e.created_at as string | null);
      if (!ref) continue;
      const d = moscowToday(new Date(ref));
      expensesByDay.set(d, (expensesByDay.get(d) ?? 0) + Number(e.amount ?? 0));
    }
    const tsDates = new Set(timeseries.map((t) => t.date));
    for (const [d, amount] of Array.from(expensesByDay.entries())) {
      if (!tsDates.has(d)) {
        const parts = d.split("-");
        timeseries.push({
          date: d,
          label: parts.length === 3 ? `${parts[2]}.${parts[1]}` : d,
          orders: 0,
          revenue: 0,
          profit: 0,
          invested: 0,
          expenses: amount,
        });
      }
    }
    for (const t of timeseries) {
      t.expenses = expensesByDay.get(t.date) ?? 0;
    }
    timeseries.sort((a, b) => a.date.localeCompare(b.date));

    const payouts = payoutsResult.data || [];
    const totalPayouts = payouts.reduce((sum, p) => sum + (p.amount ?? 0), 0);

    // ─── Касса: обязательства владельца (§9.2 баланс + §7.4 +ВАЙБ-долг) ───
    const customersRows = (customersResult.data || []) as Array<{
      id: string;
      name: string | null;
      telegram_username: string | null;
      customer_balance: number | null;
      vibe_enabled: boolean | null;
      vibe_credit_limit_override: number | null;
    }>;
    const vibeDebtRows = (vibeDebtResult.data || []) as Array<{
      customer_id: string;
      debt: number | null;
    }>;
    const customerById = new Map(customersRows.map((c) => [c.id, c]));

    // (а) Σ положительных балансов — деньги, которые владелец должен
    //     клиентам и обязан держать на картах нетронутыми.
    const customerBalanceOwed = customersRows.reduce(
      (sum, c) => sum + Math.max(0, Number(c.customer_balance ?? 0)),
      0
    );

    // (б) Список +ВАЙБ-должников + общий виртуальный долг.
    const debts = vibeDebtRows
      .filter((v) => Number(v.debt ?? 0) > 0)
      .map((v) => {
        const c = customerById.get(v.customer_id);
        return {
          id: v.customer_id,
          username: c?.telegram_username ?? null,
          name: c?.name ?? null,
          debt: Number(v.debt ?? 0),
          limit: c?.vibe_credit_limit_override ?? null,
          isVibePlus: !!c?.vibe_enabled,
        };
      })
      .sort((a, b) => b.debt - a.debt);
    const vibeDebtTotal = debts.reduce((sum, d) => sum + d.debt, 0);
    // totalDebt в API = +ВАЙБ-долг (для бейджа/совместимости вкладки).
    const totalDebt = vibeDebtTotal;

    const expensesByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + (e.amount ?? 0);
    }

    const netProfit = totalProfit - totalExpenses - totalPayouts;
    const roi = totalCost > 0 ? Math.round((totalProfit / totalCost) * 100) : 0;

    // Касса (баланс/долг) — НЕ часть P&L-доната (это не потраченные
    // деньги, а обязательства/ожидания). Сегмент debts держим 0.
    const donutSegments = {
      invested: totalCost,
      profit: Math.max(0, totalProfit),
      expenses: totalExpenses,
      payouts: totalPayouts,
      debts: 0,
    };

    const allCompleted = allCompletedResult.data || [];
    const revenueByProduct: Record<string, { revenue: number; count: number }> = {};
    for (const order of allCompleted) {
      if (!order.product_id) continue;
      const r = ownerRevenue(order);
      if (r === 0 && !isRevenueCounted(order.status ?? "")) continue;
      if (!revenueByProduct[order.product_id]) {
        revenueByProduct[order.product_id] = { revenue: 0, count: 0 };
      }
      revenueByProduct[order.product_id].revenue += r;
      revenueByProduct[order.product_id].count += 1;
    }

    const quantityByProduct: Record<string, number> = {};
    for (const ps of productSizesResult.data || []) {
      if (!ps.product_id) continue;
      quantityByProduct[ps.product_id] =
        (quantityByProduct[ps.product_id] || 0) + (ps.initial_quantity || 0);
    }

    const productROI = (productsResult.data || [])
      .map((p) => {
        const totalQuantity = quantityByProduct[p.id] || 1;
        const totalInvested = (p.purchase_price || 0) * totalQuantity;
        const sales = revenueByProduct[p.id] || { revenue: 0, count: 0 };
        const paybackPercent =
          totalInvested > 0 ? Math.round((sales.revenue / totalInvested) * 1000) / 10 : 0;
        const mainIdx = p.photo_main_index ?? 0;

        return {
          id: p.id,
          name: p.name,
          category: p.category || null,
          photo: p.photo_urls?.[mainIdx] || p.photo_urls?.[0] || null,
          totalInvested,
          totalRevenue: sales.revenue,
          unitsSold: sales.count,
          paybackPercent,
          profit: sales.revenue - totalInvested,
        };
      })
      .sort((a, b) => b.paybackPercent - a.paybackPercent);

    const expenseCategories = (categoriesResult.data || []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      sortOrder: c.sort_order,
    }));

    return NextResponse.json({
      period: { days, startDate },
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        totalExpenses,
        totalPayouts,
        totalDebt,
        netProfit,
        cashInflow,
        cashInflowBreakdown: {
          orders: cashFromOrders,
          vibe: cashFromVibe,
          partner: cashFromPartner,
        },
        roi,
        completedOrders: completedOrders.length,
        totalOrders: orders.length,
      },
      donutSegments,
      timeseries,
      trendCompare,
      expenses: expenses.map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        date: e.expense_date || e.created_at,
      })),
      expensesByCategory,
      expenseCategories,
      payouts: payouts.map((p) => ({
        id: p.id,
        amount: p.amount,
        shipperId: p.shipper_id,
        note: p.note,
        date: p.created_at,
      })),
      debts,
      treasury: {
        // Σ положительных customer_balance — владелец обязан держать
        // эту сумму на картах нетронутой (экстренные выводы клиентам).
        customerBalanceOwed,
        // Σ customer_vibe_debt — клиенты должны владельцу в долг;
        // этих денег на картах ещё нет (виртуальное ожидание).
        vibeDebtTotal,
        // §10.4 — партнёры должны владельцу по комиссиям (status='sent',
        // деньги от клиента получены, не погашено). Тоже «ожидаемое
        // поступление», не текущий кэш.
        partnerDebtOwed,
      },
      productROI,
    });
  } catch (error) {
    console.error("Owner finance GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const expenseSchema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  expenseDate: z.string().optional(),
});

const payoutSchema = z.object({
  shipperId: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().optional(),
});

const deleteSchema = z.object({
  type: z.enum(["expense", "payout"]),
  id: z.string().uuid(),
});

/** POST — create expense or payout */
export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { type, ...data } = body;

    const supabase = createServiceClient();

    if (type === "expense") {
      const parsed = expenseSchema.parse(data);
      const { error } = await supabase.from("expenses").insert({
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description || null,
        expense_date: parsed.expenseDate || new Date().toISOString().slice(0, 10),
        created_by: session.userId,
      });

      if (error) {
        console.error("Create expense error:", error);
        return NextResponse.json({ error: "Ошибка создания расхода" }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (type === "payout") {
      const parsed = payoutSchema.parse(data);
      const { error } = await supabase.from("shipper_payouts").insert({
        shipper_id: parsed.shipperId,
        amount: parsed.amount,
        note: parsed.note || null,
      });

      if (error) {
        console.error("Create payout error:", error);
        return NextResponse.json({ error: "Ошибка создания выплаты" }, { status: 500 });
      }

      // Канон §9.6: владелец зафиксировал факт выплаты — уведомляем
      // отправщика «выплата переведена» (fire-and-forget).
      notifyShipperPayoutPaid({
        shipperId: parsed.shipperId,
        amount: parsed.amount,
      }).catch((e) => console.error("notifyShipperPayoutPaid failed:", e));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Неизвестный тип" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Owner finance POST error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/** DELETE — remove expense or payout */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const result = deleteSchema.safeParse(params);

    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные параметры", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { type, id } = result.data;
    const supabase = createServiceClient();
    const table = type === "expense" ? "expenses" : "shipper_payouts";

    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      console.error(`Delete ${type} error:`, error);
      return NextResponse.json({ error: `Ошибка удаления` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Owner finance DELETE error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

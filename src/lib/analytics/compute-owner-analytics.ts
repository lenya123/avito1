import { createServiceClient } from "@/lib/supabase/server";
import { generateOwnerInsights } from "@/lib/analytics/owner-insights-engine";
import { aggregateLossByProduct } from "@/lib/stock/loss";
import {
  aggregateOwnerFinance,
  ownerRevenue,
  ownerCost,
  ownerProfit,
} from "@/lib/finance/owner-revenue";
import type { OwnerAnalyticsResponse } from "@/hooks/use-owner-analytics";

type SupabaseClient = ReturnType<typeof createServiceClient>;

export interface RunOwnerAnalyticsInput {
  supabase: SupabaseClient;
  period: "week" | "month" | "quarter" | "year" | "custom";
  granularity?: "day" | "week" | "month";
  dateFrom?: string;
  dateTo?: string;
  compare?: boolean;
  /** §15: фильтр канала сбыта (all = свернуть, drop / avito = только этот). */
  channel?: "all" | "drop" | "avito";
}

// ===== Helpers =====

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getPeriodDates(period: string, dateFrom?: string, dateTo?: string) {
  const now = new Date();
  let from: Date;
  const to = dateTo ? new Date(dateTo) : now;

  if (dateFrom) {
    from = new Date(dateFrom);
  } else {
    const daysMap: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };
    const daysBack = daysMap[period] || 30;
    from = new Date(now);
    from.setDate(from.getDate() - daysBack);
  }

  return { from, to };
}

function getPrevPeriodDates(from: Date, to: Date) {
  const durationMs = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - durationMs),
    to: new Date(from.getTime()),
  };
}

type DailyBucket = {
  revenue: number;
  profit: number;
  orders: number;
  cost: number;
  expenses: number;
};

function aggregateChart(dailyData: Map<string, DailyBucket>, granularity: string) {
  const entries = Array.from(dailyData.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (granularity === "day" || !granularity) {
    return entries.map(([date, d]) => ({
      date,
      revenue: d.revenue,
      profit: d.profit,
      orders: d.orders,
      aov: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0,
      roiPercent: d.cost > 0 ? Math.round((d.profit / d.cost) * 100) : 0,
      expenses: d.expenses,
    }));
  }

  const buckets = new Map<string, DailyBucket>();
  for (const [date, d] of entries) {
    const dateObj = new Date(date);
    let bucketKey: string;
    if (granularity === "week") {
      const day = dateObj.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(dateObj);
      monday.setDate(dateObj.getDate() + diff);
      bucketKey = toLocalDateStr(monday);
    } else {
      // month
      bucketKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-01`;
    }
    const bucket = buckets.get(bucketKey) || {
      revenue: 0,
      profit: 0,
      orders: 0,
      cost: 0,
      expenses: 0,
    };
    bucket.revenue += d.revenue;
    bucket.profit += d.profit;
    bucket.orders += d.orders;
    bucket.cost += d.cost;
    bucket.expenses += d.expenses;
    buckets.set(bucketKey, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      revenue: d.revenue,
      profit: d.profit,
      orders: d.orders,
      aov: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0,
      roiPercent: d.cost > 0 ? Math.round((d.profit / d.cost) * 100) : 0,
      expenses: d.expenses,
    }));
}

function calculateHealthScore(params: {
  roi: number;
  avgFulfillmentDays: number;
  revenueGrowth: number;
  repeatPurchaseRate: number;
}) {
  const profitability = Math.min(100, Math.round((params.roi / 150) * 100));
  const fulfillment =
    params.avgFulfillmentDays <= 1
      ? 100
      : params.avgFulfillmentDays <= 2
        ? 80
        : params.avgFulfillmentDays <= 3
          ? 50
          : Math.max(0, Math.round(100 - params.avgFulfillmentDays * 20));
  const growth = Math.max(0, Math.min(100, Math.round(50 + params.revenueGrowth)));
  const clientHealth = Math.min(100, Math.round(params.repeatPurchaseRate * 2));

  const total = Math.round(
    profitability * 0.3 + fulfillment * 0.25 + growth * 0.25 + clientHealth * 0.2
  );

  let interpretation: string;
  if (total >= 80)
    interpretation = "Бизнес в отличном состоянии. Все показатели на высоком уровне.";
  else if (total >= 60) interpretation = "Хорошее состояние. Есть зоны для улучшения.";
  else if (total >= 40) interpretation = "Требует внимания. Несколько показателей ниже нормы.";
  else interpretation = "Критическое состояние. Необходимы срочные действия.";

  return {
    total: Math.min(100, Math.max(0, total)),
    profitability: Math.min(100, Math.max(0, profitability)),
    fulfillment: Math.min(100, Math.max(0, fulfillment)),
    growth: Math.min(100, Math.max(0, growth)),
    clientHealth: Math.min(100, Math.max(0, clientHealth)),
    interpretation,
  };
}

// ===== Main =====

export async function runOwnerAnalytics(
  input: RunOwnerAnalyticsInput
): Promise<OwnerAnalyticsResponse> {
  const {
    supabase,
    period,
    granularity: requestedGranularity,
    dateFrom: reqDateFrom,
    dateTo: reqDateTo,
    compare,
    channel = "all",
  } = input;

  const { from: dateFrom, to: dateTo } = getPeriodDates(period, reqDateFrom, reqDateTo);
  const prev = getPrevPeriodDates(dateFrom, dateTo);
  const wantComparison = compare === true;

  const dateFromStr = dateFrom.toISOString();
  const dateToStr = dateTo.toISOString();
  const prevFromStr = prev.from.toISOString();
  const prevToStr = prev.to.toISOString();
  const periodDays = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / 86400000));

  const granularity =
    requestedGranularity || (periodDays <= 31 ? "day" : periodDays <= 180 ? "week" : "month");

  // Parallel queries. Single-tenant: все products принадлежат владельцу,
  // seller_id фильтр убран в Stage 1.
  const [
    { data: orders },
    { data: prevOrders },
    { data: allCustomers },
    { data: products },
    { data: productSizes },
    { data: reconciliations },
    { data: expensesCur },
    { data: expensesPrev },
  ] = await Promise.all([
    (() => {
      let q = supabase
        .from("orders")
        .select(
          "id, product_id, customer_id, client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, sale_price, status, fault_reason, created_at, shipped_at, completed_at, shipped_by, size, source, avito_fee_snapshot, avito_marketing_snapshot"
        )
        .gte("created_at", dateFromStr)
        .lte("created_at", dateToStr);
      if (channel !== "all") q = q.eq("source", channel);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("orders")
        .select(
          "id, product_id, customer_id, client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, status, fault_reason, created_at, source, avito_fee_snapshot, avito_marketing_snapshot"
        )
        .gte("created_at", prevFromStr)
        .lte("created_at", prevToStr);
      if (channel !== "all") q = q.eq("source", channel);
      return q;
    })(),
    supabase
      .from("customers")
      .select("id, created_at, is_frozen, is_blocked, telegram_username, name, customer_balance"),
    supabase
      .from("products")
      .select("id, name, category, is_active, photo_urls, created_at")
      .is("deleted_at", null),
    supabase.from("product_sizes").select("product_id, current_quantity"),
    supabase
      .from("stock_reconciliations")
      .select("product_id, delta, purchase_price_snapshot")
      .gte("created_at", dateFromStr)
      .lte("created_at", dateToStr),
    // Расходы за период (для метрики «Расходы» в TrendChart + financeSummary).
    supabase
      .from("expenses")
      .select("amount, expense_date, created_at")
      .gte("created_at", dateFromStr)
      .lte("created_at", dateToStr),
    // Расходы за прошлый период (для comparisonChart, если запросили compare).
    supabase
      .from("expenses")
      .select("amount, expense_date, created_at")
      .gte("created_at", prevFromStr)
      .lte("created_at", prevToStr),
  ]);

  const safeOrders = (orders || []) as Array<{
    id: string;
    product_id: string | null;
    customer_id: string | null;
    client_price: number;
    purchase_price: number;
    shipper_rate_snapshot: number | null;
    partner_id: string | null;
    partner_commission_snapshot: number | null;
    sale_price: number | null;
    status: string;
    fault_reason: string | null;
    created_at: string;
    shipped_at: string | null;
    completed_at: string | null;
    shipped_by: string | null;
    size: string | null;
  }>;
  const safePrevOrders = (prevOrders || []) as Array<{
    id: string;
    product_id: string | null;
    customer_id: string | null;
    client_price: number;
    purchase_price: number;
    shipper_rate_snapshot: number | null;
    partner_id: string | null;
    partner_commission_snapshot: number | null;
    status: string;
    fault_reason: string | null;
    created_at: string;
  }>;
  const safeClients = (allCustomers || []) as Array<{
    id: string;
    created_at: string;
    is_frozen: boolean | null;
    is_blocked: boolean | null;
    telegram_username: string | null;
    name: string | null;
  }>;
  const safeProducts = (products || []) as Array<{
    id: string;
    name: string;
    category: string | null;
    is_active: boolean;
    photo_urls: string[] | null;
    created_at: string;
  }>;
  const safeSizes = (productSizes || []) as Array<{
    product_id: string;
    current_quantity: number | null;
  }>;

  // ===== FINANCIAL HERO ===== единый канон §9.3/§9.4 (партнёрский =
  // комиссия; БЕЗ ставки отправщика — отложено до модели выплат). Общий
  // хелпер на все экраны.
  const finCur = aggregateOwnerFinance(safeOrders);
  const revenue = finCur.revenue;
  const cost = finCur.cost;
  const profit = finCur.profit;
  const roiPercent = cost > 0 ? Math.round((profit / cost) * 100) : 0;
  const aov = finCur.count > 0 ? Math.round(revenue / finCur.count) : 0;

  const finPrev = aggregateOwnerFinance(safePrevOrders);
  const prevRevenue = finPrev.revenue;
  const prevCost = finPrev.cost;
  const prevProfit = finPrev.profit;
  const profitChange =
    prevProfit > 0 ? Math.round(((profit - prevProfit) / prevProfit) * 100) : null;
  const revenueChange =
    prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;
  const costChange = prevCost > 0 ? Math.round(((cost - prevCost) / prevCost) * 100) : null;
  const prevAovCalc =
    safePrevOrders.length > 0 ? Math.round(prevRevenue / safePrevOrders.length) : 0;
  const aovChange = prevAovCalc > 0 ? Math.round(((aov - prevAovCalc) / prevAovCalc) * 100) : null;
  const prevRoi = prevCost > 0 ? Math.round((prevProfit / prevCost) * 100) : 0;
  const roiChange = prevRoi > 0 ? Math.round(((roiPercent - prevRoi) / prevRoi) * 100) : null;

  // ===== CHART DATA =====
  const emptyBucket = (): DailyBucket => ({
    revenue: 0,
    profit: 0,
    orders: 0,
    cost: 0,
    expenses: 0,
  });
  const dailyData = new Map<string, DailyBucket>();
  const cursor = new Date(dateFrom);
  cursor.setHours(12, 0, 0, 0);
  const endDate = new Date(dateTo);
  endDate.setHours(12, 0, 0, 0);
  while (cursor <= endDate) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    const dayStr = `${y}-${m}-${dd}`;
    dailyData.set(dayStr, emptyBucket());
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const order of safeOrders) {
    if (!order.created_at) continue;
    const day = order.created_at.split("T")[0];
    const d = dailyData.get(day) || emptyBucket();
    // Канон §9.3/§9.4 через общий хелпер (партнёрский=комиссия, гейт по
    // статусу). Не учтённые в выручке заказы дают 0, но в orders счёт идёт.
    const r = ownerRevenue(order);
    const c = ownerCost(order);
    d.revenue += r;
    d.cost += c;
    d.profit += r - c;
    d.orders += 1;
    dailyData.set(day, d);
  }
  // Расходы по бакетам — для метрики «Расходы» в TrendChart. Ключ-день
  // тот же что и у заказов (`split("T")[0]` от `expense_date || created_at`).
  for (const e of expensesCur ?? []) {
    const ref = (e.expense_date as string | null) ?? (e.created_at as string | null);
    if (!ref) continue;
    const day = ref.split("T")[0];
    const d = dailyData.get(day) || emptyBucket();
    d.expenses += Number(e.amount ?? 0);
    dailyData.set(day, d);
  }
  const chart = aggregateChart(dailyData, granularity);

  // Comparison chart — строим если запрошен compare И есть заказы ИЛИ
  // расходы в прошлом периоде (иначе overlay был бы пуст по любой метрике).
  let comparisonChart = null;
  if (wantComparison && (safePrevOrders.length > 0 || (expensesPrev?.length ?? 0) > 0)) {
    const prevDaily = new Map<string, DailyBucket>();
    for (const order of safePrevOrders) {
      if (!order.created_at) continue;
      const day = order.created_at.split("T")[0];
      const d = prevDaily.get(day) || emptyBucket();
      const r = ownerRevenue(order);
      const c = ownerCost(order);
      d.revenue += r;
      d.cost += c;
      d.profit += r - c;
      d.orders += 1;
      prevDaily.set(day, d);
    }
    for (const e of expensesPrev ?? []) {
      const ref = (e.expense_date as string | null) ?? (e.created_at as string | null);
      if (!ref) continue;
      const day = ref.split("T")[0];
      const d = prevDaily.get(day) || emptyBucket();
      d.expenses += Number(e.amount ?? 0);
      prevDaily.set(day, d);
    }
    comparisonChart = aggregateChart(prevDaily, granularity);
  }

  // ===== FUNNEL =====
  const statusCounts = new Map<string, number>();
  for (const o of safeOrders) {
    statusCounts.set(o.status, (statusCounts.get(o.status) || 0) + 1);
  }
  // Канон §4.2: paid → collecting → sent (финал отправки), return → return_done.
  // UI-ключи (awaitingShipment/inTransit/completed) сохранены для backward
  // compat фронта, но мапятся на канонические БД-статусы.
  const funnel = {
    awaitingShipment: statusCounts.get("paid") || 0,
    collecting: statusCounts.get("collecting") || 0,
    inTransit: statusCounts.get("sent") || 0,
    completed: statusCounts.get("sent") || 0,
    returned: (statusCounts.get("return") || 0) + (statusCounts.get("return_done") || 0),
    problem: statusCounts.get("problem") || 0,
    cancelled: statusCounts.get("cancelled") || 0,
  };

  // ===== PRODUCT MATRIX =====
  const productMap = new Map(safeProducts.map((p) => [p.id, p]));
  const stockByProduct = new Map<string, number>();
  for (const s of safeSizes) {
    stockByProduct.set(
      s.product_id,
      (stockByProduct.get(s.product_id) || 0) + (s.current_quantity || 0)
    );
  }

  // Недостачи за период: единый хелпер aggregateLossByProduct (тот же
  // источник и формула, что фильтр «С недостачей» в списке Товары и блок
  // на странице товара). units = Σ положит. delta, rub = по снимку
  // закупочной. surplus тут не используем (разрез «По недостаче»).
  const lossByProduct = aggregateLossByProduct(reconciliations ?? []);

  const ordersByProduct = new Map<
    string,
    { orders: number; revenue: number; cost: number; returns: number; lastDate: string | null }
  >();
  for (const o of safeOrders) {
    const pid = o.product_id;
    if (!pid) continue;
    const data = ordersByProduct.get(pid) || {
      orders: 0,
      revenue: 0,
      cost: 0,
      returns: 0,
      lastDate: null,
    };
    data.orders += 1;
    data.revenue += ownerRevenue(o);
    data.cost += ownerCost(o);
    if (["return", "return_done"].includes(o.status)) {
      data.returns += 1;
    }
    if (!data.lastDate || (o.created_at && o.created_at > data.lastDate)) {
      data.lastDate = o.created_at;
    }
    ordersByProduct.set(pid, data);
  }

  const prevOrdersByProduct = new Map<string, { orders: number; revenue: number; cost: number }>();
  for (const o of safePrevOrders) {
    const pid = o.product_id;
    if (!pid) continue;
    const data = prevOrdersByProduct.get(pid) || { orders: 0, revenue: 0, cost: 0 };
    data.orders += 1;
    data.revenue += ownerRevenue(o);
    data.cost += ownerCost(o);
    prevOrdersByProduct.set(pid, data);
  }

  const productMatrixRaw: Array<{
    id: string;
    name: string;
    photo: string | null;
    category: string;
    orders: number;
    revenue: number;
    profit: number;
    roiPercent: number;
    returnRate: number;
    stockRemaining: number;
    turnoverDays: number | null;
    trend: number;
    trendRevenue: number;
    trendProfit: number;
    trendOrders: number;
    lossUnits: number;
    lossRub: number;
  }> = [];

  const pctChange = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;

  for (const [pid, pData] of Array.from(ordersByProduct.entries())) {
    const product = productMap.get(pid);
    if (!product) continue;
    const pProfit = pData.revenue - pData.cost;
    const pRoi = pData.cost > 0 ? Math.round((pProfit / pData.cost) * 100) : 0;
    const pReturnRate = pData.orders > 0 ? Math.round((pData.returns / pData.orders) * 100) : 0;
    const stock = stockByProduct.get(pid) || 0;
    const velocityPerDay = pData.orders / periodDays;
    const turnoverDays = velocityPerDay > 0 ? Math.round(stock / velocityPerDay) : null;

    const prevData = prevOrdersByProduct.get(pid);
    const prevProfit = prevData ? prevData.revenue - prevData.cost : 0;
    const trendRevenue = pctChange(pData.revenue, prevData?.revenue || 0);
    const trendProfit = pctChange(pProfit, prevProfit);
    const trendOrders = pctChange(pData.orders, prevData?.orders || 0);

    productMatrixRaw.push({
      id: pid,
      name: product.name,
      photo: product.photo_urls?.[0] || null,
      category: product.category || "Без категории",
      orders: pData.orders,
      revenue: pData.revenue,
      profit: pProfit,
      roiPercent: pRoi,
      returnRate: pReturnRate,
      stockRemaining: stock,
      turnoverDays,
      trend: trendRevenue, // legacy field for backwards compat
      trendRevenue,
      trendProfit,
      trendOrders,
      lossUnits: lossByProduct.get(pid)?.units || 0,
      lossRub: lossByProduct.get(pid)?.rub || 0,
    });
  }

  for (const product of safeProducts) {
    if (ordersByProduct.has(product.id)) continue;
    const stock = stockByProduct.get(product.id) || 0;
    // Товар без заказов в периоде пропускаем, КРОМЕ случая когда по нему
    // была недостача за период — иначе он не попадёт в разрез «По недостаче».
    if (stock <= 0 && !product.is_active && !lossByProduct.has(product.id)) continue;
    productMatrixRaw.push({
      id: product.id,
      name: product.name,
      photo: product.photo_urls?.[0] || null,
      category: product.category || "Без категории",
      orders: 0,
      revenue: 0,
      profit: 0,
      roiPercent: 0,
      returnRate: 0,
      stockRemaining: stock,
      turnoverDays: null,
      trend: 0,
      trendRevenue: 0,
      trendProfit: 0,
      trendOrders: 0,
      lossUnits: lossByProduct.get(product.id)?.units || 0,
      lossRub: lossByProduct.get(product.id)?.rub || 0,
    });
  }

  // ABC classification
  const sortedByProfit = [...productMatrixRaw].sort((a, b) => b.profit - a.profit);
  const totalProductProfit = sortedByProfit.reduce((s, p) => s + Math.max(0, p.profit), 0);
  let cumulativeProfit = 0;
  const productMatrix = sortedByProfit.map((p) => {
    cumulativeProfit += Math.max(0, p.profit);
    const share = totalProductProfit > 0 ? cumulativeProfit / totalProductProfit : 1;
    const abcClass: "A" | "B" | "C" = share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
    return { ...p, abcClass };
  });

  // Categories
  const catMap = new Map<
    string,
    { productCount: number; orders: number; revenue: number; profit: number }
  >();
  for (const p of productMatrix) {
    const cat = catMap.get(p.category) || { productCount: 0, orders: 0, revenue: 0, profit: 0 };
    cat.productCount += 1;
    cat.orders += p.orders;
    cat.revenue += p.revenue;
    cat.profit += p.profit;
    catMap.set(p.category, cat);
  }
  const totalCatRevenue = Array.from(catMap.values()).reduce((s, c) => s + c.revenue, 0);
  const categories = Array.from(catMap.entries())
    .map(([name, c]) => ({
      name,
      productCount: c.productCount,
      orders: c.orders,
      revenue: c.revenue,
      profit: c.profit,
      roiPercent:
        c.revenue - c.profit > 0 ? Math.round((c.profit / (c.revenue - c.profit)) * 100) : 0,
      revenueShare: totalCatRevenue > 0 ? Math.round((c.revenue / totalCatRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ===== CLIENTS =====
  const clientOrderMap = new Map<
    string,
    { orders: number; revenue: number; profit: number; lastDate: string | null }
  >();
  for (const o of safeOrders) {
    const cid = o.customer_id;
    if (!cid) continue;
    const data = clientOrderMap.get(cid) || { orders: 0, revenue: 0, profit: 0, lastDate: null };
    data.orders += 1;
    data.revenue += ownerRevenue(o);
    data.profit += ownerProfit(o);
    if (!data.lastDate || (o.created_at && o.created_at > data.lastDate)) {
      data.lastDate = o.created_at;
    }
    clientOrderMap.set(cid, data);
  }

  const newClientsInPeriod = safeClients.filter(
    (c) => c.created_at && c.created_at >= dateFromStr && c.created_at <= dateToStr
  );
  const newClientIds = new Set(newClientsInPeriod.map((c) => c.id));
  const activeClientIds = new Set(clientOrderMap.keys());

  const prevClientIds = new Set(
    safePrevOrders.map((o) => o.customer_id).filter((v): v is string => !!v)
  );
  const churned = Array.from(prevClientIds).filter((id) => !activeClientIds.has(id)).length;

  // Loyal clients: 5+ orders in both current AND previous month
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const clientMonthlyOrders = new Map<string, { cur: number; prev: number }>();
  const allOrdersForLoyalty = [...safeOrders, ...safePrevOrders];
  for (const o of allOrdersForLoyalty) {
    if (!o.customer_id || !o.created_at) continue;
    const month = o.created_at.slice(0, 7);
    if (month !== curMonth && month !== prevMonth) continue;
    const data = clientMonthlyOrders.get(o.customer_id) || { cur: 0, prev: 0 };
    if (month === curMonth) data.cur++;
    else data.prev++;
    clientMonthlyOrders.set(o.customer_id, data);
  }
  const loyalClients = Array.from(clientMonthlyOrders.entries()).filter(
    ([cid, d]) => activeClientIds.has(cid) && d.cur >= 5 && d.prev >= 5
  );
  const repeatPurchaseRate =
    activeClientIds.size > 0 ? Math.round((loyalClients.length / activeClientIds.size) * 100) : 0;

  const avgOrdersPerClient =
    activeClientIds.size > 0 ? Math.round((safeOrders.length / activeClientIds.size) * 10) / 10 : 0;

  const revenuePerClient =
    activeClientIds.size > 0 ? Math.round(revenue / activeClientIds.size) : 0;

  let newRevenue = 0;
  let returningRevenue = 0;
  for (const o of safeOrders) {
    const r = ownerRevenue(o);
    if (o.customer_id && newClientIds.has(o.customer_id)) {
      newRevenue += r;
    } else {
      returningRevenue += r;
    }
  }

  // Top clients (up to 50)
  const clientMap = new Map(safeClients.map((c) => [c.id, c]));
  const topClients = Array.from(clientOrderMap.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 50)
    .map(([cid, d]) => {
      const client = clientMap.get(cid);
      return {
        id: cid,
        username: client?.telegram_username || null,
        name: client?.name || null,
        revenue: d.revenue,
        profit: d.profit,
        orders: d.orders,
        aov: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0,
        lastOrderDate: d.lastDate,
        revenueShare: revenue > 0 ? Math.round((d.revenue / revenue) * 100) : 0,
      };
    });

  // ===== OPERATIONAL =====
  const shippedOrders = safeOrders.filter((o) => o.shipped_at && o.created_at);
  const avgFulfillmentDays =
    shippedOrders.length > 0
      ? Math.round(
          (shippedOrders.reduce((s, o) => {
            return (
              s + (new Date(o.shipped_at!).getTime() - new Date(o.created_at!).getTime()) / 86400000
            );
          }, 0) /
            shippedOrders.length) *
            10
        ) / 10
      : 0;

  const deliveredOrders = safeOrders.filter((o) => o.completed_at && o.shipped_at);
  const avgDeliveryDays =
    deliveredOrders.length > 0
      ? Math.round(
          (deliveredOrders.reduce((s, o) => {
            return (
              s +
              (new Date(o.completed_at!).getTime() - new Date(o.shipped_at!).getTime()) / 86400000
            );
          }, 0) /
            deliveredOrders.length) *
            10
        ) / 10
      : 0;

  const pendingBacklog = safeOrders.filter((o) => ["paid", "collecting"].includes(o.status)).length;

  // Client deposit pool — в новой модели нет users.deposit. Оставляем поле = 0
  // для обратной совместимости UI. В Stage 3 добавим показатель "+ВАЙБ-долг в пуле".
  const clientDepositPool = 0;

  const shipperEfficiency =
    periodDays > 0 ? Math.round((shippedOrders.length / periodDays) * 10) / 10 : 0;

  const problemCount = safeOrders.filter((o) => o.status === "problem").length;
  const problemRate =
    safeOrders.length > 0 ? Math.round((problemCount / safeOrders.length) * 100) : 0;

  // ===== HEALTH SCORE =====
  const revenueGrowth =
    prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;

  const roi = cost > 0 ? Math.round((profit / cost) * 100) : 0;

  const healthScoreCalc = calculateHealthScore({
    roi,
    avgFulfillmentDays,
    revenueGrowth,
    repeatPurchaseRate,
  });

  const prevHealthScore = calculateHealthScore({
    roi: prevCost > 0 ? Math.round((prevProfit / prevCost) * 100) : 0,
    avgFulfillmentDays: 2,
    revenueGrowth: 0,
    repeatPurchaseRate: 0,
  });

  const healthScoreTrend = healthScoreCalc.total - prevHealthScore.total;

  // ===== FORECAST =====
  const dailyValues = Array.from(dailyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, d]) => d);
  const fmid = Math.max(1, Math.floor(dailyValues.length / 2));
  const firstHalf = dailyValues.slice(0, fmid);
  const secondHalf = dailyValues.slice(fmid);

  const avgFirstRevenue =
    firstHalf.length > 0 ? firstHalf.reduce((s, d) => s + d.revenue, 0) / firstHalf.length : 0;
  const avgSecondRevenue =
    secondHalf.length > 0 ? secondHalf.reduce((s, d) => s + d.revenue, 0) / secondHalf.length : 0;
  const avgRevenuePerDay = Math.round(avgFirstRevenue * 0.35 + avgSecondRevenue * 0.65);

  const avgFirstProfit =
    firstHalf.length > 0 ? firstHalf.reduce((s, d) => s + d.profit, 0) / firstHalf.length : 0;
  const avgSecondProfit =
    secondHalf.length > 0 ? secondHalf.reduce((s, d) => s + d.profit, 0) / secondHalf.length : 0;
  const avgProfitPerDay = Math.round(avgFirstProfit * 0.35 + avgSecondProfit * 0.65);

  const avgFirstOrders =
    firstHalf.length > 0 ? firstHalf.reduce((s, d) => s + d.orders, 0) / firstHalf.length : 0;
  const avgSecondOrders =
    secondHalf.length > 0 ? secondHalf.reduce((s, d) => s + d.orders, 0) / secondHalf.length : 0;
  const avgOrdersPerDay = Math.round((avgFirstOrders * 0.35 + avgSecondOrders * 0.65) * 10) / 10;

  const avgOrderCost = safeOrders.length > 0 ? Math.round(cost / safeOrders.length) : 0;
  const growthRate = revenueGrowth;
  const totalStock = safeSizes.reduce((s, sz) => s + (sz.current_quantity || 0), 0);
  const totalSold = safeOrders.length;
  const avgStockVelocityPerDay =
    periodDays > 0 ? Math.round((totalSold / periodDays) * 10) / 10 : 0;
  const prevAvgRevenuePerDay =
    periodDays > 0 && safePrevOrders.length > 0 ? Math.round(prevRevenue / periodDays) : 0;
  const prevAvgProfitPerDay =
    periodDays > 0 && safePrevOrders.length > 0 ? Math.round(prevProfit / periodDays) : 0;
  const prevAvgOrdersPerDay =
    periodDays > 0 && safePrevOrders.length > 0
      ? Math.round((safePrevOrders.length / periodDays) * 10) / 10
      : 0;

  // ===== INSIGHTS & DOW =====
  const ordersByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
  for (const o of safeOrders) {
    if (o.created_at) {
      const dow = new Date(o.created_at).getDay();
      ordersByDayOfWeek[dow]++;
    }
  }

  void curMonth;
  void prevMonth;
  const churnedClients = Array.from(prevClientIds).filter((id) => !activeClientIds.has(id)).length;

  const insights = generateOwnerInsights({
    revenue,
    profit,
    roiPercent,
    aov,
    prevRevenue: prevRevenue || null,
    prevProfit: prevProfit || null,
    prevRoiPercent: prevCost > 0 ? Math.round(((prevRevenue - prevCost) / prevCost) * 100) : null,
    prevAov: safePrevOrders.length > 0 ? Math.round(prevRevenue / safePrevOrders.length) : null,
    products: productMatrix.map((p) => ({
      id: p.id,
      name: p.name,
      revenue: p.revenue,
      profit: p.profit,
      roiPercent: p.roiPercent,
      returnRate: p.returnRate,
      stockRemaining: p.stockRemaining,
      velocityPerDay: p.orders / periodDays,
      daysOfStock: p.turnoverDays,
      ordersInPeriod: p.orders,
      lastOrderDate: ordersByProduct.get(p.id)?.lastDate || null,
      createdAt: productMap.get(p.id)?.created_at || new Date().toISOString(),
    })),
    avgFulfillmentDays,
    totalClients: safeClients.length,
    activeClients: activeClientIds.size,
    revenueByClient: topClients.map((c) => ({
      id: c.id,
      username: c.username || "—",
      revenue: c.revenue,
    })),
    churnedClients,
    categories: categories.map((c) => ({
      name: c.name,
      revenue: c.revenue,
      profit: c.profit,
      roiPercent: c.roiPercent,
    })),
  });

  // ─── Finance summary (карточка-мост на Аналитике, см. /owner/finance) ───
  // Период-scoped: расходы (reuse `expensesCur` из основного Promise.all,
  // он же кормит метрику «Расходы» в TrendChart), выплаты. Point-in-time:
  // обязательства (баланс клиентов, +ВАЙБ-долг, партнёрский долг — те же
  // канон-формулы что и в /api/owner/finance). netProfit = валовая −
  // расходы − выплаты.
  const [payoutsRes, vibeDebtRes, partnerDebtRes] = await Promise.all([
    supabase
      .from("shipper_payouts")
      .select("amount")
      .gte("created_at", dateFromStr)
      .lte("created_at", dateToStr),
    supabase.from("customer_vibe_debt").select("debt"),
    supabase
      .from("orders")
      .select("partner_commission_snapshot")
      .eq("status", "sent")
      .not("partner_payment_received_at", "is", null)
      .is("partner_commission_paid_at", null),
  ]);
  const totalExpensesFs = (expensesCur ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const expensesCountFs = expensesCur?.length ?? 0;
  const totalPayoutsFs = (payoutsRes.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const payoutsCountFs = payoutsRes.data?.length ?? 0;
  const customerBalanceOwedFs = (allCustomers ?? []).reduce(
    (s, c) =>
      s + Math.max(0, Number((c as { customer_balance?: number | null }).customer_balance ?? 0)),
    0
  );
  const vibeDebtTotalFs = (vibeDebtRes.data ?? []).reduce((s, v) => s + Number(v.debt ?? 0), 0);
  const partnerDebtOwedFs = (partnerDebtRes.data ?? []).reduce(
    (s, r) => s + Number(r.partner_commission_snapshot ?? 0),
    0
  );
  const netProfitFs = profit - totalExpensesFs - totalPayoutsFs;

  // ТЗ §15.5: суммы Avito-расходов канала для карточки «Каналы сбыта».
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeOrdersAny = (orders ?? []) as any[];
  const avitoFeesSum = safeOrdersAny.reduce(
    (s, o) => s + Number(o.avito_fee_snapshot ?? 0),
    0
  );
  const avitoMarketingSum = safeOrdersAny.reduce(
    (s, o) => s + Number(o.avito_marketing_snapshot ?? 0),
    0
  );

  return {
    period: {
      from: toLocalDateStr(dateFrom),
      to: toLocalDateStr(dateTo),
      label: period,
    },
    financial: {
      revenue,
      cost,
      profit,
      roiPercent,
      aov,
      profitChange,
      revenueChange,
      costChange,
      aovChange,
      roiChange,
    },
    channels: {
      avito_fees: Math.round(avitoFeesSum),
      avito_marketing: Math.round(avitoMarketingSum),
    },
    chart,
    comparisonChart,
    funnel,
    insights,
    productMatrix,
    categories,
    clientStats: {
      total: safeClients.length,
      active: activeClientIds.size,
      new: newClientsInPeriod.length,
      loyal: loyalClients.length,
      churned,
      repeatPurchaseRate,
      avgOrdersPerClient,
      revenuePerClient,
      newRevenue,
      returningRevenue,
    },
    topClients,
    healthScore: {
      ...healthScoreCalc,
      trend: healthScoreTrend,
    },
    operational: {
      avgFulfillmentDays,
      avgDeliveryDays,
      pendingBacklog,
      clientDepositPool,
      shipperEfficiency,
      problemRate,
    },
    financeSummary: {
      netProfit: netProfitFs,
      totalExpenses: totalExpensesFs,
      expensesCount: expensesCountFs,
      totalPayouts: totalPayoutsFs,
      payoutsCount: payoutsCountFs,
      treasury: {
        customerBalanceOwed: customerBalanceOwedFs,
        vibeDebtTotal: vibeDebtTotalFs,
        partnerDebtOwed: partnerDebtOwedFs,
      },
    },
    forecast: {
      avgRevenuePerDay,
      avgProfitPerDay,
      avgOrdersPerDay,
      avgOrderCost,
      growthRate,
      totalStock,
      avgStockVelocityPerDay,
      prevAvgRevenuePerDay,
      prevAvgProfitPerDay,
      prevAvgOrdersPerDay,
    },
    ordersByDayOfWeek,
  };
}

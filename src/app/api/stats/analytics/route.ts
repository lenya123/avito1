import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";
import { generateInsights, type InsightsInput } from "@/lib/analytics/insights-engine";

// --- Schema ---

const analyticsQuerySchema = z.object({
  period: z.enum(["week", "month", "quarter", "all", "custom"]).default("month"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// --- Level thresholds ---

const LEVELS = [
  { level: 0, ordersRequired: 0, discount: 0 },
  { level: 1, ordersRequired: 15, discount: 3 },
  { level: 2, ordersRequired: 30, discount: 6 },
  { level: 3, ordersRequired: 50, discount: 10 },
];

// --- GET /api/stats/analytics ---

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const isPremium =
      session.isVibePlus ||
      session.subscriptionTier === "premium" ||
      session.subscriptionTier === "top_floor_boss";

    if (!isPremium) {
      return NextResponse.json({ error: "Доступно только для Premium" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const result = analyticsQuerySchema.safeParse(params);

    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные параметры", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { period, dateFrom: paramDateFrom, dateTo: paramDateTo } = result.data;

    // --- Date ranges ---

    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date = now;
    let prevStartDate: Date | null = null;
    let prevEndDate: Date | null = null;

    if (period === "custom" && paramDateFrom) {
      // Custom date range
      startDate = new Date(paramDateFrom);
      startDate.setHours(0, 0, 0, 0);
      if (paramDateTo) {
        endDate = new Date(paramDateTo);
        endDate.setHours(23, 59, 59, 999);
      }
      // Previous period = same duration before startDate
      const durationMs = endDate.getTime() - startDate.getTime();
      prevEndDate = new Date(startDate);
      prevStartDate = new Date(startDate.getTime() - durationMs);
    } else if (period !== "all") {
      const daysMap = { week: 7, month: 30, quarter: 90 } as const;
      const days = daysMap[period as keyof typeof daysMap];

      startDate = new Date(now);
      startDate.setDate(now.getDate() - days);

      prevEndDate = new Date(startDate);
      prevStartDate = new Date(prevEndDate);
      prevStartDate.setDate(prevEndDate.getDate() - days);
    }

    const supabase = createServiceClient();

    // --- Parallel queries ---

    const orderSelect =
      "id, status, client_price, sale_price, client_profit, delivery_service, size, created_at, shipped_at, completed_at, cancelled_at, product_id, products(name, photo_urls, recommended_price)";

    const queryA = supabase
      .from("orders")
      .select(orderSelect)
      .eq("client_id", session.userId)
      .order("created_at", { ascending: false });

    if (startDate) {
      queryA.gte("created_at", startDate.toISOString());
    }
    if (period === "custom" && paramDateTo) {
      queryA.lte("created_at", endDate.toISOString());
    }

    const queryB = supabase
      .from("orders")
      .select("id, client_price, sale_price, created_at, shipped_at, products(recommended_price)")
      .eq("client_id", session.userId)
      .in("status", ["awaiting_shipment", "collecting", "in_transit"]);

    // Previous period (for trend)
    let queryC: ReturnType<typeof supabase.from> | null = null;
    if (prevStartDate && prevEndDate) {
      queryC = supabase
        .from("orders")
        .select(
          "id, status, client_price, sale_price, client_profit, delivery_service, shipped_at, completed_at, product_id, products(name)"
        )
        .eq("client_id", session.userId)
        .gte("created_at", prevStartDate.toISOString())
        .lt("created_at", prevEndDate.toISOString());
    }

    const queryE = supabase
      .from("users")
      .select("level, total_completed_orders, discount_percent, deposit, referral_deposit")
      .eq("id", session.userId)
      .single();

    const queryF = supabase
      .from("referral_bonuses")
      .select("id, first_order_bonus, first_order_bonus_paid, percent_bonus, is_active")
      .eq("referrer_id", session.userId);

    // Planner always uses all-time data (separate query when period !== "all")
    const needsSeparatePlannerQuery = startDate !== null;
    const queryPlanner = needsSeparatePlannerQuery
      ? supabase
          .from("orders")
          .select("id, status, client_price, client_profit, created_at, completed_at")
          .eq("client_id", session.userId)
          .order("created_at", { ascending: false })
      : null;

    const [resA, resB, resC, resE, resF, resPlanner] = await Promise.all([
      queryA,
      queryB,
      queryC,
      queryE,
      queryF,
      queryPlanner,
    ]);

    if (resA.error) {
      console.error("Analytics orders fetch error:", resA.error);
      return NextResponse.json({ error: "Ошибка загрузки данных" }, { status: 500 });
    }

    const orders = resA.data || [];
    const activeOrders = resB.data || [];
    const prevOrders: Array<{
      id: string;
      status: string | null;
      client_price: number | null;
      sale_price: number | null;
      client_profit: number | null;
      delivery_service: string | null;
      shipped_at: string | null;
      completed_at: string | null;
      product_id: string | null;
      products: { name: string } | null;
    }> = resC?.data || [];
    const userData = resE.data;
    const referrals = resF.data || [];

    if (!userData) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // --- Statuses classification ---

    const excludedStatuses = ["cancelled", "disposed", "trash"];
    const returnStatuses = ["return_in_transit", "return_arrived", "return_completed"];

    // --- Filter valid orders ---

    type OrderRow = (typeof orders)[number];

    const validOrders = orders.filter(
      (o: OrderRow) => o.status && !excludedStatuses.includes(o.status)
    );
    const completedOrders = orders.filter((o: OrderRow) => o.status === "completed");
    const cancelledOrders = orders.filter((o: OrderRow) =>
      excludedStatuses.includes(o.status || "")
    );
    const allReturnOrders = orders.filter((o: OrderRow) => returnStatuses.includes(o.status || ""));
    // --- Return losses (profit lost on returns) ---

    const returnLoss = allReturnOrders.reduce((sum: number, o: OrderRow) => {
      const salePrice = o.sale_price || 0;
      const clientPrice = o.client_price || 0;
      return sum + Math.max(0, salePrice - clientPrice);
    }, 0);

    // --- Financial data ---

    const totalInvested = completedOrders.reduce(
      (sum: number, o: OrderRow) => sum + (o.client_price || 0),
      0
    );
    const totalRevenue = completedOrders.reduce(
      (sum: number, o: OrderRow) => sum + (o.sale_price || 0),
      0
    );
    const totalProfit = completedOrders.reduce(
      (sum: number, o: OrderRow) => sum + (o.client_profit || 0),
      0
    );
    const roi = totalInvested > 0 ? Math.round((totalProfit / totalInvested) * 100) : 0;

    // Previous period financial
    const prevValidOrders = prevOrders.filter(
      (o) => o.status && !excludedStatuses.includes(o.status)
    );
    const prevCompletedOrders = prevOrders.filter((o) => o.status === "completed");
    const prevTotalProfit = prevCompletedOrders.reduce((sum, o) => sum + (o.client_profit || 0), 0);
    const prevTotalInvested = prevCompletedOrders.reduce(
      (sum, o) => sum + (o.client_price || 0),
      0
    );

    // Profit trend as percentage change
    let profitTrend = 0;
    if (prevTotalProfit > 0) {
      profitTrend = Math.round(((totalProfit - prevTotalProfit) / prevTotalProfit) * 100);
    } else if (totalProfit > 0) {
      profitTrend = 100; // Went from 0 to something
    }

    // --- Metric trends (previous period deltas) ---

    const computeTrendDelta = (current: number, previous: number): number | null => {
      if (previous === 0 && current === 0) return null;
      if (previous === 0) return current > 0 ? 100 : null;
      return Math.round(((current - previous) / Math.abs(previous)) * 100);
    };

    const prevAvgProfitPerOrder =
      prevCompletedOrders.length > 0
        ? prevCompletedOrders.reduce((sum, o) => sum + (o.client_profit || 0), 0) /
          prevCompletedOrders.length
        : 0;

    const prevAllReturnOrders = prevOrders.filter((o) => returnStatuses.includes(o.status || ""));
    const prevReturnRate =
      prevValidOrders.length > 0 ? (prevAllReturnOrders.length / prevValidOrders.length) * 100 : 0;

    const prevFinalizedOrders = prevOrders.filter((o) =>
      ["completed", ...returnStatuses].includes(o.status || "")
    );
    const prevDeliveryConvRate =
      prevFinalizedOrders.length > 0
        ? (prevCompletedOrders.length / prevFinalizedOrders.length) * 100
        : 0;

    const prevRoi =
      prevTotalInvested > 0 ? Math.round((prevTotalProfit / prevTotalInvested) * 100) : 0;

    // --- Health Score (new: Доходность / Точность выбора / Активность / Динамика) ---

    const hasOrders = validOrders.length > 0;

    // 1. Доходность (35%) — ROI-based (ROI 30% → 50pts, ROI 60%+ → 100pts)
    const profitabilityScore = Math.min(100, Math.max(0, Math.round((roi * 100) / 60)));

    // 2. Точность выбора (30%) — inverted return+cancel rate
    //    Если заказов нет — 0, а не 100 (нет данных ≠ идеальный результат)
    const returnRate =
      validOrders.length > 0 ? (allReturnOrders.length / validOrders.length) * 100 : 0;
    const cancelRate = orders.length > 0 ? (cancelledOrders.length / orders.length) * 100 : 0;
    const selectionAccuracyScore = hasOrders
      ? Math.min(100, Math.max(0, 100 - returnRate * 2 - cancelRate))
      : 0;

    // 3. Активность (15%) — orders this period vs previous period
    //    Если заказов нет в обоих периодах — 0, а не 70
    let activityScore = 0;
    if (prevValidOrders.length > 0) {
      activityScore = Math.min(
        100,
        Math.max(0, (validOrders.length / prevValidOrders.length) * 100)
      );
    } else if (validOrders.length > 0) {
      activityScore = 80; // First period with orders
    }

    // 4. Рост прибыли (20%) — profit growth scaled 0-100
    //    Если прибыли нет в обоих периодах — 0, а не 50
    let growthScore = 0;
    if (prevTotalProfit > 0) {
      const growthPct = ((totalProfit - prevTotalProfit) / prevTotalProfit) * 100;
      // -50% = 0, 0% = 50, +50% = 100
      growthScore = Math.min(100, Math.max(0, 50 + growthPct));
    } else if (totalProfit > 0) {
      growthScore = 90; // New profit from zero
    }

    const healthScoreTotal = Math.round(
      profitabilityScore * 0.35 +
        selectionAccuracyScore * 0.3 +
        activityScore * 0.15 +
        growthScore * 0.2
    );

    // Previous period health score for trend
    let healthScoreTrend = 0;
    if (prevValidOrders.length > 0) {
      const prevAllReturns = prevOrders.filter((o) => returnStatuses.includes(o.status || ""));
      const prevCancelled = prevOrders.filter((o) => excludedStatuses.includes(o.status || ""));

      // Prev profitability (ROI-based, same formula as current)
      const prevProf = Math.min(100, Math.max(0, Math.round((prevRoi * 100) / 60)));

      // Prev selection accuracy (same formula as current: returns/valid, cancel/all)
      const prevRetRate =
        prevValidOrders.length > 0 ? (prevAllReturns.length / prevValidOrders.length) * 100 : 0;
      const prevCancelRate =
        prevOrders.length > 0 ? (prevCancelled.length / prevOrders.length) * 100 : 0;
      const prevSelection = Math.min(100, Math.max(0, 100 - prevRetRate * 2 - prevCancelRate));

      // Prev activity & growth are relative to the period before prev, which we don't have
      // Use same defaults as current period for fair comparison
      const prevActivity = prevValidOrders.length > 0 ? 50 : 0;
      const prevGrowth = prevTotalProfit > 0 ? 50 : 0;

      const prevTotal = Math.round(
        prevProf * 0.35 + prevSelection * 0.3 + prevActivity * 0.15 + prevGrowth * 0.2
      );
      healthScoreTrend = healthScoreTotal - prevTotal;
    }

    // Interpretation
    let interpretation = "";
    if (healthScoreTotal >= 90) interpretation = "Невероятные результаты! Так держать";
    else if (healthScoreTotal >= 75) interpretation = "Бизнес растёт стабильно";
    else if (healthScoreTotal >= 60) interpretation = "Есть потенциал для роста";
    else if (healthScoreTotal >= 40) interpretation = "Стоит обратить внимание на слабые места";
    else interpretation = "Давай разберёмся, что можно улучшить";

    // --- Metrics ---

    const totalCompletedProfit = totalProfit;
    const avgProfitPerOrder =
      completedOrders.length > 0 ? totalCompletedProfit / completedOrders.length : 0;

    // Best order
    let bestOrder: { profit: number; productName: string; productPhoto: string | null } | null =
      null;
    if (completedOrders.length > 0) {
      const best = completedOrders.reduce(
        (max: OrderRow | null, o: OrderRow) => {
          if (!max || (o.client_profit || 0) > (max.client_profit || 0)) return o;
          return max;
        },
        null as OrderRow | null
      );

      if (best) {
        const product = best.products as {
          name: string;
          photo_urls: string[] | null;
          recommended_price: number | null;
        } | null;
        bestOrder = {
          profit: best.client_profit || 0,
          productName: product?.name || "Неизвестный товар",
          productPhoto: product?.photo_urls?.[0] || null,
        };
      }
    }

    // Average margin
    const ordersWithSalePrice = completedOrders.filter(
      (o: OrderRow) => o.sale_price && o.sale_price > 0 && o.client_profit != null
    );
    const avgMargin =
      ordersWithSalePrice.length > 0
        ? ordersWithSalePrice.reduce(
            (sum: number, o: OrderRow) => sum + ((o.client_profit || 0) / o.sale_price!) * 100,
            0
          ) / ordersWithSalePrice.length
        : 0;

    // Potential profit from active orders
    const potentialProfit = activeOrders.reduce((sum, o) => {
      const product = o.products as { recommended_price: number | null } | null;
      const recommended = product?.recommended_price || 0;
      const clientPrice = o.client_price || 0;
      if (recommended > clientPrice) {
        return sum + (recommended - clientPrice);
      }
      return sum;
    }, 0);

    // Actual money invested in active orders (client_price)
    const activeInvested = activeOrders.reduce((sum, o) => sum + (o.client_price || 0), 0);

    // Rates
    // Конверсия доставки: completed / (completed + returned) — для метрик UI
    const finalizedOrders = orders.filter((o: OrderRow) =>
      ["completed", ...returnStatuses].includes(o.status || "")
    );
    const deliveryConvRate =
      finalizedOrders.length > 0 ? (completedOrders.length / finalizedOrders.length) * 100 : 0;

    // Доля завершения: completed / (completed + returned + cancelled) — для планировщика
    const terminalCount = completedOrders.length + allReturnOrders.length + cancelledOrders.length;
    const completionRate = terminalCount > 0 ? (completedOrders.length / terminalCount) * 100 : 0;

    // Average delivery days
    const ordersWithDeliveryTime = completedOrders.filter(
      (o: OrderRow) => o.shipped_at && o.completed_at
    );
    const avgDeliveryDays =
      ordersWithDeliveryTime.length > 0
        ? ordersWithDeliveryTime.reduce((sum: number, o: OrderRow) => {
            return (
              sum +
              (new Date(o.completed_at!).getTime() - new Date(o.shipped_at!).getTime()) / 86400000
            );
          }, 0) / ordersWithDeliveryTime.length
        : 0;

    // --- Funnel ---

    const funnelCreated = orders.length;
    const funnelPaid = orders.filter(
      (o: OrderRow) => o.status && !excludedStatuses.includes(o.status)
    ).length;

    const shippedStatuses = ["in_transit", "completed", ...returnStatuses, "trash", "disposed"];
    const funnelShipped = orders.filter(
      (o: OrderRow) => o.status && shippedStatuses.includes(o.status)
    ).length;

    const deliveredStatuses = ["completed", ...returnStatuses];
    const funnelDelivered = orders.filter(
      (o: OrderRow) => o.status && deliveredStatuses.includes(o.status)
    ).length;

    const funnelReturned = allReturnOrders.length;
    const funnelCancelled = cancelledOrders.length;

    // --- Products analytics ---

    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        photoUrl: string | null;
        ordersCount: number;
        completedCount: number;
        totalProfit: number;
        totalClientPrice: number;
        totalSalePrice: number;
        completedClientPrice: number;
        returnCount: number;
        returnLoss: number;
        sizes: Record<string, number>;
      }
    >();

    for (const order of orders) {
      if (!order.product_id) continue;
      const product = order.products as {
        name: string;
        photo_urls: string[] | null;
        recommended_price: number | null;
      } | null;

      if (!productMap.has(order.product_id)) {
        productMap.set(order.product_id, {
          id: order.product_id,
          name: product?.name || "Неизвестный",
          photoUrl: product?.photo_urls?.[0] || null,
          ordersCount: 0,
          completedCount: 0,
          totalProfit: 0,
          totalClientPrice: 0,
          totalSalePrice: 0,
          completedClientPrice: 0,
          returnCount: 0,
          returnLoss: 0,
          sizes: {},
        });
      }

      const p = productMap.get(order.product_id)!;
      if (!excludedStatuses.includes(order.status || "")) {
        p.ordersCount++;
        p.totalClientPrice += order.client_price || 0;
        p.totalSalePrice += order.sale_price || 0;
      }

      if (order.status === "completed") {
        p.completedCount++;
        p.totalProfit += order.client_profit || 0;
        p.completedClientPrice += order.client_price || 0;
      }

      if (returnStatuses.includes(order.status || "")) {
        p.returnCount++;
        p.returnLoss += order.client_price || 0;
      }

      if (order.size) {
        p.sizes[order.size] = (p.sizes[order.size] || 0) + 1;
      }
    }

    const productsAnalytics = Array.from(productMap.values())
      .map((p) => ({
        id: p.id,
        name: p.name,
        photoUrl: p.photoUrl,
        ordersCount: p.ordersCount,
        totalProfit: Math.round(p.totalProfit),
        totalRevenue: Math.round(p.totalSalePrice),
        totalInvested: Math.round(p.totalClientPrice),
        avgProfitPerOrder: p.completedCount > 0 ? Math.round(p.totalProfit / p.completedCount) : 0,
        roi:
          p.completedClientPrice > 0
            ? Math.round((p.totalProfit / p.completedClientPrice) * 100)
            : 0,
        returnRate: p.ordersCount > 0 ? Math.round((p.returnCount / p.ordersCount) * 100) : 0,
        returnLoss: Math.round(p.returnLoss),
        sizes: p.sizes,
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 10);

    // --- Delivery analytics ---

    const deliveryMap = new Map<
      string,
      {
        ordersCount: number;
        deliveryDays: number[];
        cycleDays: number[];
        lateCount: number;
        returnCount: number;
      }
    >();

    for (const order of orders) {
      if (!order.delivery_service || excludedStatuses.includes(order.status || "")) continue;

      if (!deliveryMap.has(order.delivery_service)) {
        deliveryMap.set(order.delivery_service, {
          ordersCount: 0,
          deliveryDays: [],
          cycleDays: [],
          lateCount: 0,
          returnCount: 0,
        });
      }

      const d = deliveryMap.get(order.delivery_service)!;
      d.ordersCount++;

      if (order.status === "completed" && order.shipped_at && order.completed_at) {
        const days =
          (new Date(order.completed_at).getTime() - new Date(order.shipped_at).getTime()) /
          86400000;
        d.deliveryDays.push(Math.max(0, days));
        if (days > 7) d.lateCount++;

        // Full cycle: created → completed
        if (order.created_at) {
          const cycle =
            (new Date(order.completed_at).getTime() - new Date(order.created_at).getTime()) /
            86400000;
          d.cycleDays.push(Math.max(0, cycle));
        }
      }

      if (order.status === "return_completed") {
        d.returnCount++;
      }
    }

    const deliveryAnalytics = Array.from(deliveryMap.entries())
      .map(([service, d]) => ({
        service,
        ordersCount: d.ordersCount,
        avgDeliveryDays:
          d.deliveryDays.length > 0
            ? d.deliveryDays.reduce((s, v) => s + v, 0) / d.deliveryDays.length
            : 0,
        latePercent:
          d.deliveryDays.length > 0 ? Math.round((d.lateCount / d.deliveryDays.length) * 100) : 0,
        returnPercent: d.ordersCount > 0 ? Math.round((d.returnCount / d.ordersCount) * 100) : 0,
      }))
      .sort((a, b) => b.ordersCount - a.ordersCount);

    // --- Money cycle ---

    const ordersWithCycle = completedOrders.filter((o: OrderRow) => o.created_at && o.completed_at);
    const avgCycleDays =
      ordersWithCycle.length > 0
        ? ordersWithCycle.reduce((sum: number, o: OrderRow) => {
            return (
              sum +
              (new Date(o.completed_at!).getTime() - new Date(o.created_at!).getTime()) / 86400000
            );
          }, 0) / ordersWithCycle.length
        : 0;

    // Remaining days — only for shipped (in-transit) orders
    // Unshipped orders are counted separately (pendingShipmentCount)
    const nowMs = now.getTime();
    const shippedActive = activeOrders.filter((o) => o.shipped_at && o.created_at);
    const pendingShipmentCount = activeOrders.length - shippedActive.length;
    const pendingShipmentInvested = activeOrders
      .filter((o) => !o.shipped_at)
      .reduce((sum, o) => sum + (o.client_price || 0), 0);

    let avgRemainingDays = 0;
    if (avgCycleDays > 0 && shippedActive.length > 0) {
      const totalRemaining = shippedActive.reduce((sum, o) => {
        const daysSinceCreation = (nowMs - new Date(o.created_at as string).getTime()) / 86400000;
        return sum + Math.max(1, avgCycleDays - daysSinceCreation);
      }, 0);
      avgRemainingDays = totalRemaining / shippedActive.length;
    }

    const moneyCycleByService = Array.from(deliveryMap.entries())
      .filter(([, d]) => d.cycleDays.length > 0)
      .map(([service, d]) => ({
        service,
        avgDays:
          Math.round((d.cycleDays.reduce((s, v) => s + v, 0) / d.cycleDays.length) * 10) / 10,
        ordersCount: d.cycleDays.length,
      }))
      .sort((a, b) => a.avgDays - b.avgDays);

    // --- Sizes (for product details, kept in API) ---

    const sizesMap: Record<string, number> = {};
    let totalOrdersForSizes = 0;
    for (const order of validOrders) {
      if (order.size) {
        sizesMap[order.size] = (sizesMap[order.size] || 0) + 1;
        totalOrdersForSizes++;
      }
    }

    // --- Progress ---

    const userLevel = userData.level || 0;
    const totalCompleted = userData.total_completed_orders || 0;
    const nextLevelConfig = LEVELS[userLevel + 1] || null;

    const ordersToNextLevel = nextLevelConfig
      ? Math.max(0, nextLevelConfig.ordersRequired - totalCompleted)
      : null;

    // Estimate days to next level based on order rate
    let estimatedDaysToNextLevel: number | null = null;
    if (ordersToNextLevel !== null && ordersToNextLevel > 0 && period !== "all" && startDate) {
      const daysInPeriod = (now.getTime() - startDate.getTime()) / 86400000;
      const ordersPerDay = daysInPeriod > 0 ? completedOrders.length / daysInPeriod : 0;
      estimatedDaysToNextLevel =
        ordersPerDay > 0 ? Math.ceil(ordersToNextLevel / ordersPerDay) : null;
    }

    // --- Average order price for deposit calculation ---

    const avgOrderPrice =
      validOrders.length > 0
        ? validOrders.reduce((sum: number, o: OrderRow) => sum + (o.client_price || 0), 0) /
          validOrders.length
        : 0;

    // --- Orders per day tempo ---
    let ordersPerDay = 0;
    if (startDate) {
      const daysInPeriod = (now.getTime() - startDate.getTime()) / 86400000;
      ordersPerDay = daysInPeriod > 0 ? funnelCreated / daysInPeriod : 0;
    } else if (orders.length > 0) {
      const earliest = orders.reduce((min: number, o: OrderRow) => {
        if (!o.created_at) return min;
        const d = new Date(o.created_at).getTime();
        return d < min ? d : min;
      }, Infinity);
      const daysInPeriod = (now.getTime() - earliest) / 86400000;
      ordersPerDay = daysInPeriod > 0 ? funnelCreated / daysInPeriod : 0;
    }

    // --- Planner data (always all-time) ---

    const plannerOrders = needsSeparatePlannerQuery ? resPlanner?.data || [] : orders;

    const plannerCompleted = plannerOrders.filter(
      (o: { status: string | null }) => o.status === "completed"
    );
    const plannerReturns = plannerOrders.filter((o: { status: string | null }) =>
      returnStatuses.includes(o.status || "")
    );
    const plannerCancelled = plannerOrders.filter((o: { status: string | null }) =>
      excludedStatuses.includes(o.status || "")
    );

    const plannerCompletedAvgPrice =
      plannerCompleted.length > 0
        ? plannerCompleted.reduce(
            (sum: number, o: { client_price: number | null }) => sum + (o.client_price || 0),
            0
          ) / plannerCompleted.length
        : 0;

    const plannerAvgProfit =
      plannerCompleted.length > 0
        ? plannerCompleted.reduce(
            (sum: number, o: { client_profit: number | null }) => sum + (o.client_profit || 0),
            0
          ) / plannerCompleted.length
        : 0;

    const plannerWithCycle = plannerCompleted.filter(
      (o: { created_at: string | null; completed_at: string | null }) =>
        o.created_at && o.completed_at
    );
    const plannerAvgCycleDays =
      plannerWithCycle.length > 0
        ? plannerWithCycle.reduce(
            (sum: number, o: { created_at: string | null; completed_at: string | null }) =>
              sum +
              (new Date(o.completed_at!).getTime() - new Date(o.created_at!).getTime()) / 86400000,
            0
          ) / plannerWithCycle.length
        : 0;

    const plannerTerminal =
      plannerCompleted.length + plannerReturns.length + plannerCancelled.length;
    const plannerConvRate =
      plannerTerminal > 0 ? (plannerCompleted.length / plannerTerminal) * 100 : 0;

    let plannerOrdersPerDay = 0;
    if (plannerOrders.length > 0) {
      const plannerEarliest = plannerOrders.reduce(
        (min: number, o: { created_at: string | null }) => {
          if (!o.created_at) return min;
          const d = new Date(o.created_at).getTime();
          return d < min ? d : min;
        },
        Infinity
      );
      const plannerDaysSpan = (now.getTime() - plannerEarliest) / 86400000;
      plannerOrdersPerDay = plannerDaysSpan > 0 ? plannerOrders.length / plannerDaysSpan : 0;
    }

    // --- Referral stats ---

    const referralCount = referrals.length;
    const referralEarned = referrals.reduce(
      (sum, r) => sum + (r.first_order_bonus || 0) + (r.percent_bonus || 0),
      0
    );
    const activeReferrals = referrals.filter((r) => r.is_active).length;

    // --- Previous period per-product ROI (for roi_declining insight) ---

    const prevProductMap = new Map<
      string,
      { id: string; name: string; totalProfit: number; totalClientPrice: number }
    >();
    for (const o of prevOrders) {
      if (!o.product_id || o.status !== "completed") continue;
      if (!prevProductMap.has(o.product_id)) {
        const product = o.products as { name: string } | null;
        prevProductMap.set(o.product_id, {
          id: o.product_id,
          name: product?.name || "Неизвестный",
          totalProfit: 0,
          totalClientPrice: 0,
        });
      }
      const p = prevProductMap.get(o.product_id)!;
      p.totalProfit += o.client_profit || 0;
      p.totalClientPrice += o.client_price || 0;
    }

    const prevProducts = Array.from(prevProductMap.values()).map((p) => ({
      id: p.id,
      name: p.name,
      roi: p.totalClientPrice > 0 ? Math.round((p.totalProfit / p.totalClientPrice) * 100) : 0,
    }));

    // --- Inactive products (in prev period but not in current) ---

    const currentProductIds = new Set(Array.from(productMap.keys()));
    const inactiveProductNames: string[] = [];
    prevProductMap.forEach((p, id) => {
      if (!currentProductIds.has(id)) {
        inactiveProductNames.push(p.name);
      }
    });

    // --- Best day of week ---

    let bestDayOfWeek: { day: number; percent: number } | null = null;
    if (orders.length >= 10) {
      const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun=0 .. Sat=6
      for (const o of orders) {
        if (o.created_at) {
          dayCounts[new Date(o.created_at).getDay()]++;
        }
      }
      const maxCount = Math.max(...dayCounts);
      const maxDay = dayCounts.indexOf(maxCount);
      const percent = Math.round((maxCount / orders.length) * 100);
      bestDayOfWeek = { day: maxDay, percent };
    }

    // --- Insights ---

    const insightsInput: InsightsInput = {
      products: productsAnalytics.map((p) => ({
        id: p.id,
        name: p.name,
        ordersCount: p.ordersCount,
        totalProfit: p.totalProfit,
        returnRate: p.returnRate,
        roi: p.roi,
      })),
      sizes: sizesMap,
      totalOrdersForSizes,
      activeOrdersCount: activeOrders.length,
      potentialProfit,
      hasOrdersInPeriod: orders.length > 0,
      totalCompletedOrders: totalCompleted,
      level: userLevel,
      ordersToNextLevel,
      nextLevel: nextLevelConfig?.level ?? null,
      nextDiscountPercent: nextLevelConfig?.discount ?? null,
      avgCycleDays: Math.round(avgCycleDays * 10) / 10,
      cancelRate,
      totalProfit,
      prevProducts,
      inactiveProductNames,
      bestDayOfWeek,
    };

    const insights = generateInsights(insightsInput);

    // --- Response ---

    return NextResponse.json({
      financial: {
        totalProfit: Math.round(totalProfit),
        totalInvested: Math.round(totalInvested),
        totalRevenue: Math.round(totalRevenue),
        roi,
        profitTrend,
        activeOrdersCount: activeOrders.length,
        potentialProfit: Math.round(potentialProfit),
        activeInvested: Math.round(activeInvested),
      },
      healthScore: {
        total: healthScoreTotal,
        trend: Math.round(healthScoreTrend),
        profitability: Math.round(profitabilityScore),
        selectionAccuracy: Math.round(selectionAccuracyScore),
        activity: Math.round(activityScore),
        growth: Math.round(growthScore),
        interpretation,
      },
      metrics: {
        avgProfitPerOrder: Math.round(avgProfitPerOrder),
        bestOrder,
        avgMargin: Math.round(avgMargin * 10) / 10,
        potentialProfit: Math.round(potentialProfit),
        conversionRate: Math.round(deliveryConvRate * 10) / 10,
        returnRate: Math.round(returnRate * 10) / 10,
        cancelRate: Math.round(cancelRate * 10) / 10,
        avgDeliveryDays: Math.round(avgDeliveryDays * 10) / 10,
        returnLoss: Math.round(returnLoss),
      },
      funnel: {
        created: funnelCreated,
        paid: funnelPaid,
        shipped: funnelShipped,
        delivered: funnelDelivered,
        returned: funnelReturned,
        cancelled: funnelCancelled,
      },
      moneyCycle: {
        avgCycleDays: Math.round(avgCycleDays * 10) / 10,
        avgRemainingDays: Math.round(avgRemainingDays * 10) / 10,
        pendingShipmentCount,
        pendingShipmentInvested: Math.round(pendingShipmentInvested),
        byService: moneyCycleByService,
      },
      products: productsAnalytics,
      delivery: deliveryAnalytics.map((d) => ({
        ...d,
        avgDeliveryDays: Math.round(d.avgDeliveryDays * 10) / 10,
      })),
      sizes: sizesMap,
      progress: {
        level: userLevel,
        nextLevel: nextLevelConfig?.level ?? null,
        completedOrders: totalCompleted,
        ordersToNextLevel,
        estimatedDaysToNextLevel,
        discountPercent: userData.discount_percent || 0,
        nextDiscountPercent: nextLevelConfig?.discount ?? null,
      },
      insights,
      deposit: userData.deposit || 0,
      referralDeposit: userData.referral_deposit || 0,
      avgOrderPrice: Math.round(avgOrderPrice),
      ordersPerDay: Math.round(ordersPerDay * 10) / 10,
      referralCount,
      referralEarned,
      activeReferrals,
      trends: {
        avgProfitPerOrder: computeTrendDelta(avgProfitPerOrder, prevAvgProfitPerOrder),
        roi: computeTrendDelta(roi, prevRoi),
        returnRate: computeTrendDelta(returnRate, prevReturnRate),
        conversionRate: computeTrendDelta(deliveryConvRate, prevDeliveryConvRate),
        profitPerDay: (() => {
          const currentPPD = ordersPerDay * avgProfitPerOrder;
          if (!startDate || !prevStartDate || !prevEndDate) return null;
          const daysInPeriod = (now.getTime() - startDate.getTime()) / 86400000;
          const prevOrdersPerDay = daysInPeriod > 0 ? prevOrders.length / daysInPeriod : 0;
          const prevPPD = prevOrdersPerDay * prevAvgProfitPerOrder;
          return computeTrendDelta(currentPPD, prevPPD);
        })(),
      },
      period,
      periodCompletedCount: completedOrders.length,
      conversionRate: Math.round(completionRate * 10) / 10,
      planner: {
        completedAvgPrice: Math.round(plannerCompletedAvgPrice),
        avgProfitPerOrder: Math.round(plannerAvgProfit),
        avgCycleDays: Math.round(plannerAvgCycleDays * 10) / 10,
        conversionRate: Math.round(plannerConvRate * 10) / 10,
        ordersPerDay: Math.round(plannerOrdersPerDay * 10) / 10,
        completedOrders: userData.total_completed_orders || 0,
      },
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

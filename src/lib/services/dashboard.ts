import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { DashboardData } from "@/hooks/use-dashboard";
import { aggregateOwnerFinance, ownerRevenue, ownerCost } from "@/lib/finance/owner-revenue";

type Client = SupabaseClient<Database>;
type Alert = DashboardData["alerts"][number];

function formatHours(hours: number): string {
  if (hours < 1) return "< 1 ч";
  if (hours < 24) return `${hours} ч`;
  return `${Math.round(hours / 24)} д`;
}

interface BuildDashboardOpts {
  supabase: Client;
}

// Single-tenant: все продукты принадлежат владельцу, селлерский scope убран.
export async function buildDashboard({ supabase }: BuildDashboardOpts): Promise<DashboardData> {
  // Даты
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const fourteenDaysAgo = new Date(todayStart);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    ordersLast14dResult,
    yesterdayOrdersResult,
    pipelineResult,
    completedTodayResult,
    lowStockResult,
    urgentOrdersResult,
    shipperStatsResult,
    fulfillmentResult,
    topProductsResult,
    monthProfitResult,
    completedLast7dResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "created_at, client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, status, fault_reason"
      )
      .gte("created_at", fourteenDaysAgo.toISOString())
      .not("status", "in", "(cancelled,return_done)")
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select(
        "client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, status, fault_reason"
      )
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", todayStart.toISOString())
      .not("status", "in", "(cancelled,return_done)"),
    supabase
      .from("orders")
      .select("status, created_at, claimed_by")
      .in("status", ["paid", "collecting", "sent", "return"]),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("updated_at", todayStart.toISOString()),
    supabase
      .from("product_sizes")
      .select("product_id")
      .lte("current_quantity", 5)
      .gt("current_quantity", 0),
    supabase
      .from("orders")
      .select("id, order_number")
      .in("status", ["paid", "collecting"])
      .lte("send_by", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .gte("send_by", todayStart.toISOString()),
    supabase
      .from("shipper_stats")
      .select("shipper_id, orders_shipped")
      .gte("date", todayStart.toISOString().split("T")[0]),
    supabase
      .from("orders")
      .select("created_at, shipped_at")
      .not("shipped_at", "is", null)
      .gte("shipped_at", new Date(todayStart.getTime() - 7 * 86400000).toISOString()),
    supabase
      .from("orders")
      .select(
        "product_id, client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, status, fault_reason, created_at, products(name, photo_urls)"
      )
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("orders")
      .select(
        "client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, status, fault_reason"
      )
      .gte("created_at", monthStart.toISOString())
      .not("status", "in", "(cancelled,return_done)"),
    supabase
      .from("orders")
      .select("created_at, updated_at")
      .eq("status", "sent")
      .gte("updated_at", new Date(todayStart.getTime() - 7 * 86400000).toISOString()),
  ]);

  // Shippers + owner settings + customer counts + Касса (баланс/долг)
  const [
    shippersRaw,
    settingsData,
    newCustomers7dRes,
    newCustomers30dRes,
    custBalanceRes,
    vibeDebtRes,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, shipper_score")
      .eq("role", "shipper")
      .then((r) => r.data || []),
    supabase
      .from("settings")
      .select("monthly_profit_target, daily_goal")
      .single()
      .then((r) => r.data as { monthly_profit_target?: number; daily_goal?: number } | null),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo.toISOString()),
    // Касса (§9.2/§7.4): обязательства владельца — деньги на балансах
    // клиентов и виртуальный +ВАЙБ-долг (защита от кассового разрыва).
    supabase
      .from("customers")
      .select("customer_balance")
      .then((r) => r.data || []),
    supabase
      .from("customer_vibe_debt")
      .select("debt")
      .then((r) => r.data || []),
  ]);

  const customerBalanceOwed = (custBalanceRes as Array<{ customer_balance: number | null }>).reduce(
    (sum, c) => sum + Math.max(0, Number(c.customer_balance ?? 0)),
    0
  );
  const vibeDebtTotal = (vibeDebtRes as Array<{ debt: number | null }>).reduce(
    (sum, v) => sum + Math.max(0, Number(v.debt ?? 0)),
    0
  );

  const newCustomers7d = newCustomers7dRes.count ?? 0;
  const newCustomers30d = newCustomers30dRes.count ?? 0;

  const monthlyTarget = settingsData?.monthly_profit_target ?? 500000;
  const dailyGoal = settingsData?.daily_goal ?? 5;

  // --- HERO + KPI SPARKLINES ---
  const ordersLast14d = ordersLast14dResult.data || [];

  const dailyData: Record<
    string,
    { revenue: number; profit: number; orders: number; totalPrice: number; cost: number }
  > = {};
  for (let i = 13; i >= 0; i--) {
    const date = new Date(todayStart);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split("T")[0];
    dailyData[key] = { revenue: 0, profit: 0, orders: 0, totalPrice: 0, cost: 0 };
  }

  // Канон §9.3/§9.4 через общий хелпер (партнёрский=комиссия; БЕЗ ставки
  // отправщика — отложено до модели выплат). orders — объём (как было).
  ordersLast14d.forEach((o) => {
    const key = o.created_at?.split("T")[0];
    if (!key || !dailyData[key]) return;
    const r = ownerRevenue(o);
    const c = ownerCost(o);
    dailyData[key].revenue += r;
    dailyData[key].profit += r - c;
    dailyData[key].orders += 1;
    dailyData[key].totalPrice += r;
    dailyData[key].cost += c;
  });

  const dailyEntries = Object.entries(dailyData);
  const last7 = dailyEntries.slice(-7);
  const todayKey = todayStart.toISOString().split("T")[0];
  const todayData = dailyData[todayKey] || {
    revenue: 0,
    profit: 0,
    orders: 0,
    totalPrice: 0,
    cost: 0,
  };

  const profitSparkline = last7.map(([, d]) => d.profit);
  const revenueSparkline = last7.map(([, d]) => d.revenue);
  const ordersSparkline = last7.map(([, d]) => d.orders);
  const aovSparkline = last7.map(([, d]) =>
    d.orders > 0 ? Math.round(d.totalPrice / d.orders) : 0
  );
  const roiSparkline = last7.map(([, d]) =>
    d.cost > 0 ? Math.round((d.profit / d.cost) * 100) : 0
  );

  // Вчера
  const yesterdayOrders = yesterdayOrdersResult.data || [];
  const yesterdayFin = aggregateOwnerFinance(yesterdayOrders);
  const yesterdayRevenue = yesterdayFin.revenue;
  const yesterdayProfit = yesterdayFin.profit;
  const yesterdayCost = yesterdayFin.cost;
  const yesterdayOrdersCount = yesterdayOrders.length;
  const yesterdayAov =
    yesterdayOrdersCount > 0 ? Math.round(yesterdayRevenue / yesterdayOrdersCount) : 0;

  const calcChange = (today: number, yesterday: number) =>
    yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : today > 0 ? 100 : 0;

  const todayAov = todayData.orders > 0 ? Math.round(todayData.totalPrice / todayData.orders) : 0;
  const todayROI = todayData.cost > 0 ? Math.round((todayData.profit / todayData.cost) * 100) : 0;
  const yesterdayROI = yesterdayCost > 0 ? Math.round((yesterdayProfit / yesterdayCost) * 100) : 0;

  // Monthly progress
  const monthOrders = monthProfitResult.data || [];
  const monthlyProgress = aggregateOwnerFinance(monthOrders).profit;

  // --- PIPELINE ---
  // Канон §4.2: paid → collecting → sent (sent = финал отправки, не «в пути»).
  // SLA: paid > 36ч = просрочка сборки; sent > 144ч = долгая доставка.
  const pipelineOrders = pipelineResult.data || [];
  const nowMs = now.getTime();
  const SLA_HOURS: Record<string, number> = {
    paid: 36,
    sent: 144,
  };
  const pipeline = {
    awaitingShipment: 0,
    awaitingShipmentOverdue: 0,
    collecting: 0,
    collectingOverdue: 0,
    inTransit: 0,
    inTransitOverdue: 0,
    completedToday: completedTodayResult.count || 0,
    returns: 0,
  };
  pipelineOrders.forEach((o) => {
    const ageHours = o.created_at ? (nowMs - new Date(o.created_at).getTime()) / 3600000 : 0;
    if (o.status === "paid") {
      pipeline.awaitingShipment++;
      if (ageHours > SLA_HOURS.paid) pipeline.awaitingShipmentOverdue++;
    } else if (o.status === "collecting") {
      pipeline.collecting++;
    } else if (o.status === "return") {
      pipeline.returns++;
    } else if (o.status === "sent") {
      pipeline.inTransit++;
      if (ageHours > SLA_HOURS.sent) pipeline.inTransitOverdue++;
    }
  });

  // --- ALERTS ---
  const alerts: Alert[] = [];
  const urlBase = "/owner";

  const urgentOrders = urgentOrdersResult.data || [];
  if (urgentOrders.length > 0) {
    alerts.push({
      id: "urgent-orders",
      type: "urgent",
      title: "Сгорающие заказы",
      message: `${urgentOrders.length} заказ(ов) с дедлайном сегодня`,
      count: urgentOrders.length,
      actionUrl: `${urlBase}/orders?status=paid`,
      actionLabel: "Посмотреть",
    });
  }

  const lowStockProducts = new Set(
    (lowStockResult.data || []).map((r) => r.product_id).filter((v): v is string => !!v)
  );
  const lowStockCount = lowStockProducts.size;

  if (lowStockCount > 0) {
    alerts.push({
      id: "low-stock",
      type: "warning",
      title: "Заканчивается товар",
      message: `${lowStockCount} товаров с остатком ≤ 5 шт.`,
      count: lowStockCount,
      actionUrl: `${urlBase}/products?stock=low_stock`,
      actionLabel: "Товары",
    });
  }

  // --- SHIPPERS ---
  const shipperStatsRaw = shipperStatsResult.data || [];
  const shipperStatsMap: Record<string, number> = {};
  shipperStatsRaw.forEach((s) => {
    shipperStatsMap[s.shipper_id] = (shipperStatsMap[s.shipper_id] || 0) + (s.orders_shipped || 0);
  });

  const pendingByShipper: Record<string, number> = {};
  pipelineOrders.forEach((o) => {
    if (o.claimed_by && (o.status === "paid" || o.status === "collecting")) {
      pendingByShipper[o.claimed_by] = (pendingByShipper[o.claimed_by] || 0) + 1;
    }
  });

  const shippers = shippersRaw
    .map((s) => ({
      id: s.id,
      name: s.name || "Без имени",
      shippedToday: shipperStatsMap[s.id] || 0,
      elo: s.shipper_score ?? 65,
      pendingOrders: pendingByShipper[s.id] || 0,
    }))
    .sort((a, b) => b.shippedToday - a.shippedToday);

  const totalShippedToday = shippers.reduce((s, sh) => s + sh.shippedToday, 0);

  // --- FULFILLMENT ---
  const shippedOrders = fulfillmentResult.data || [];
  const avgHoursToShip =
    shippedOrders.length > 0
      ? Math.round(
          shippedOrders.reduce((s, o) => {
            return (
              s + (new Date(o.shipped_at!).getTime() - new Date(o.created_at!).getTime()) / 3600000
            );
          }, 0) / shippedOrders.length
        )
      : 0;

  const completedLast7d = completedLast7dResult.data || [];
  const avgHoursToDeliver =
    completedLast7d.length > 0
      ? Math.round(
          completedLast7d.reduce((s, o) => {
            return (
              s + (new Date(o.updated_at!).getTime() - new Date(o.created_at!).getTime()) / 3600000
            );
          }, 0) / completedLast7d.length
        )
      : 0;

  const overdueCount = pipeline.awaitingShipmentOverdue + pipeline.collectingOverdue;
  const totalActive =
    pipeline.awaitingShipment + pipeline.collecting + pipeline.inTransit + pipeline.completedToday;
  const fulfillmentRateToday =
    totalActive > 0 ? Math.round((pipeline.completedToday / totalActive) * 100) : 0;

  const totalPipelineOrders = pipeline.awaitingShipment + pipeline.collecting + pipeline.inTransit;
  const totalOverdue =
    pipeline.awaitingShipmentOverdue + pipeline.collectingOverdue + pipeline.inTransitOverdue;
  const slaComplianceRate =
    totalPipelineOrders > 0
      ? Math.round(((totalPipelineOrders - totalOverdue) / totalPipelineOrders) * 100)
      : 100;

  const activeShippers = shippers.filter((s) => s.shippedToday > 0).length;
  const ordersPerShipper =
    activeShippers > 0 ? Math.round((totalShippedToday / activeShippers) * 10) / 10 : 0;

  if (avgHoursToShip > 48) {
    alerts.push({
      id: "fulfillment-slow",
      type: "warning",
      title: "Медленная отправка",
      message: `Среднее время до отправки — ${formatHours(avgHoursToShip)}. Проверьте нагрузку на отправщиков.`,
      count: overdueCount,
      actionUrl: `${urlBase}/shippers`,
      actionLabel: "Отправщики",
    });
  }

  // --- TOP PRODUCTS ---
  const productOrders = topProductsResult.data || [];
  const fifteenDaysAgo = new Date(todayStart);
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  const productStats: Record<
    string,
    {
      name: string;
      photo: string | null;
      orders: number;
      revenue: number;
      cost: number;
      returns: number;
      recentOrders: number;
      olderOrders: number;
      lastSaleDate: string;
    }
  > = {};

  productOrders.forEach((o) => {
    if (!o.product_id) return;
    if (!productStats[o.product_id]) {
      const product = o.products as {
        name: string;
        photo_urls: string[] | null;
      } | null;
      productStats[o.product_id] = {
        name: product?.name || "Неизвестно",
        photo: product?.photo_urls?.[0] || null,
        orders: 0,
        revenue: 0,
        cost: 0,
        returns: 0,
        recentOrders: 0,
        olderOrders: 0,
        lastSaleDate: "",
      };
    }
    productStats[o.product_id].orders++;
    productStats[o.product_id].revenue += ownerRevenue(o);
    productStats[o.product_id].cost += ownerCost(o);

    if (o.created_at) {
      const orderDate = new Date(o.created_at);
      if (orderDate >= fifteenDaysAgo) {
        productStats[o.product_id].recentOrders++;
      } else {
        productStats[o.product_id].olderOrders++;
      }
      if (o.created_at > productStats[o.product_id].lastSaleDate) {
        productStats[o.product_id].lastSaleDate = o.created_at;
      }
    }

    // Канон §4.2: возврат = `return` (в процессе) или `return_done` (принят).
    if (o.status === "return" || o.status === "return_done") {
      productStats[o.product_id].returns++;
    }
  });

  const topProducts = Object.entries(productStats)
    .map(([id, s]) => ({
      id,
      name: s.name,
      photo: s.photo,
      orders: s.orders,
      revenue: s.revenue,
      profitMargin: s.revenue > 0 ? Math.round(((s.revenue - s.cost) / s.revenue) * 100) : 0,
      returnRate: s.orders > 0 ? Math.round((s.returns / s.orders) * 100) : 0,
      trend:
        s.recentOrders > s.olderOrders * 1.2
          ? ("up" as const)
          : s.recentOrders < s.olderOrders * 0.8
            ? ("down" as const)
            : ("flat" as const),
      lastSaleDate: s.lastSaleDate || null,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);

  const highReturnProduct = topProducts.find((p) => p.returnRate > 25);
  if (highReturnProduct) {
    alerts.push({
      id: "high-return-rate",
      type: "warning",
      title: "Высокий возврат",
      message: `${highReturnProduct.name} — ${highReturnProduct.returnRate}% возвратов. Проверьте качество или описание.`,
      count: 1,
      actionUrl: `${urlBase}/products/${highReturnProduct.id}`,
      actionLabel: "Товар",
    });
  }

  const profitChangePercent = calcChange(todayData.profit, yesterdayProfit);
  if (profitChangePercent <= -50 && yesterdayProfit > 0) {
    alerts.push({
      id: "profit-drop",
      type: "warning",
      title: "Падение прибыли",
      message: `Прибыль упала на ${Math.abs(profitChangePercent)}% vs вчера. Стоит проверить причину.`,
      count: 1,
      actionUrl: "/owner/analytics",
      actionLabel: "Аналитика",
    });
  }

  return {
    hero: {
      todayProfit: todayData.profit,
      profitChange: profitChangePercent,
      profitSparkline,
      monthlyTarget,
      monthlyProgress,
    },
    kpis: {
      revenue: {
        value: todayData.revenue,
        change: calcChange(todayData.revenue, yesterdayRevenue),
        sparkline: revenueSparkline,
      },
      orders: {
        value: todayData.orders,
        change: calcChange(todayData.orders, yesterdayOrdersCount),
        sparkline: ordersSparkline,
      },
      aov: {
        value: todayAov,
        change: calcChange(todayAov, yesterdayAov),
        sparkline: aovSparkline,
      },
      roi: {
        value: todayROI,
        change: calcChange(todayROI, yesterdayROI),
        sparkline: roiSparkline,
      },
    },
    alerts,
    pipeline: {
      ...pipeline,
      slaHours: SLA_HOURS,
    },
    shippers,
    totalShippedToday,
    dailyGoal,
    fulfillment: {
      avgHoursToShip,
      avgHoursToDeliver,
      overdueCount,
      slaComplianceRate,
      rateToday: fulfillmentRateToday,
      ordersPerShipper,
    },
    topProducts,
    newCustomers: {
      last7d: newCustomers7d,
      last30d: newCustomers30d,
    },
    treasury: {
      customerBalanceOwed,
      vibeDebtTotal,
    },
  };
}

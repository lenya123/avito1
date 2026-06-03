import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { ownerRevenue, ownerCost, ownerProfit } from "@/lib/finance/owner-revenue";
import { isRevenueCounted } from "@/lib/constants/pricing";
import { z } from "zod";

const statsQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  granularity: z.enum(["day", "week", "month"]).optional(),
});

type Granularity = "day" | "week" | "month";

// GET /api/owner/stats — статистика владельца для дашборда заказов
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    const result = statsQuerySchema.safeParse(params);
    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные параметры", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const {
      dateFrom: paramDateFrom,
      dateTo: paramDateTo,
      granularity: paramGranularity,
    } = result.data;

    const supabase = createServiceClient();

    // Single-tenant: все products принадлежат владельцу (seller_id дропнут в Stage 1).
    const now = new Date();

    // Определяем диапазон дат
    let startDate: Date;
    let endDate: Date;

    if (paramDateFrom) {
      startDate = new Date(paramDateFrom);
      startDate.setHours(0, 0, 0, 0);
    } else {
      const { data: firstOrder } = await supabase
        .from("orders")
        .select("created_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      startDate = firstOrder?.created_at ? new Date(firstOrder.created_at) : new Date(now);
      startDate.setHours(0, 0, 0, 0);
    }

    if (paramDateTo) {
      endDate = new Date(paramDateTo);
      endDate.setHours(0, 0, 0, 0);
    } else {
      endDate = new Date(now);
      endDate.setHours(0, 0, 0, 0);
    }

    // Авто-определение гранулярности
    const daySpan =
      Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const granularity: Granularity =
      paramGranularity ?? (daySpan <= 14 ? "day" : daySpan <= 90 ? "week" : "month");

    // Получаем заказы за период (single-tenant — без фильтра по seller_id).
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id, status, fault_reason, client_price, purchase_price, sale_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, created_at"
      )
      .gte("created_at", startDate.toISOString())
      .lte("created_at", new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Owner stats fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки статистики" }, { status: 500 });
    }

    // Активные заказы (в работе до отправки) — без фильтра по дате.
    // Канон §4.2: paid → collecting (sent уже отправлен, не «в работе»).
    const activeStatuses = ["paid", "collecting", "problem"];
    const { data: activeOrders } = await supabase
      .from("orders")
      .select(
        "id, status, fault_reason, client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot"
      )
      .in("status", activeStatuses);

    const inProgressCount = activeOrders?.length || 0;
    // Потенциальная прибыль «в работе» — канон §9.4 (партнёрский =
    // комиссия; свой − ставка отправщика).
    const inProgressAmount = (activeOrders ?? []).reduce((sum, o) => sum + ownerProfit(o), 0);

    // Генерируем бакеты
    const buckets = generateBuckets(startDate, endDate, granularity);

    let totalOrders = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalInvested = 0;
    let completedOrders = 0;

    for (const order of orders || []) {
      // Канон §9.3: гейт по статусу (исключает cancelled/return_done,
      // включает trash/problem/return). Раньше тут вручную исключались
      // cancelled+trash и НЕ исключался return_done — расходилось.
      if (!order.status || !order.created_at || !isRevenueCounted(order.status)) {
        continue;
      }

      const orderDate = new Date(order.created_at);
      const bucketKey = getBucketKey(orderDate, granularity);
      const bucket = buckets.get(bucketKey);

      // Канон §9.4 (партнёрский = комиссия; свой − ставка отправщика).
      const revenue = ownerRevenue(order);
      const cost = ownerCost(order);
      const profit = ownerProfit(order);

      if (bucket) {
        bucket.orders += 1;
        bucket.invested += cost;
        bucket.revenue += revenue;
        bucket.profit += profit;
      }

      totalOrders += 1;
      totalInvested += cost;
      totalRevenue += revenue;
      totalProfit += profit;

      if (order.status === "sent") {
        completedOrders += 1;
      }
    }

    const chartData = Array.from(buckets.values()).map((bucket) => ({
      date: bucket.date,
      label: bucket.label,
      orders: bucket.orders,
      revenue: bucket.revenue,
      profit: bucket.profit,
      invested: bucket.invested,
    }));

    const roi = totalInvested > 0 ? Math.round((totalProfit / totalInvested) * 100) : 0;

    return NextResponse.json({
      summary: {
        totalOrders,
        completedOrders,
        totalInvested,
        totalRevenue,
        totalProfit,
        roi,
        inProgress: {
          count: inProgressCount,
          amount: inProgressAmount,
        },
      },
      chartData,
      granularity,
      dateFrom: toDateKey(startDate),
      dateTo: toDateKey(endDate),
    });
  } catch (error) {
    console.error("Owner stats API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// === Helpers (same as client stats) ===

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getBucketKey(date: Date, granularity: Granularity): string {
  if (granularity === "day") {
    return toDateKey(date);
  }
  if (granularity === "week") {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return toDateKey(d);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type BucketData = {
  key: string;
  date: string;
  label: string;
  orders: number;
  revenue: number;
  profit: number;
  invested: number;
};

function generateBuckets(
  startDate: Date,
  endDate: Date,
  granularity: Granularity
): Map<string, BucketData> {
  const buckets = new Map<string, BucketData>();

  if (granularity === "day") {
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const key = toDateKey(cursor);
      buckets.set(key, {
        key,
        date: key,
        label: formatDayLabel(cursor),
        orders: 0,
        revenue: 0,
        profit: 0,
        invested: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (granularity === "week") {
    const cursor = new Date(startDate);
    const day = cursor.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    cursor.setDate(cursor.getDate() + diff);
    cursor.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const key = toDateKey(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      buckets.set(key, {
        key,
        date: key,
        label: formatWeekLabel(cursor, weekEnd),
        orders: 0,
        revenue: 0,
        profit: 0,
        invested: 0,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= endMonth) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, {
        key,
        date: toDateKey(cursor),
        label: formatMonthLabel(cursor, startDate, endDate),
        orders: 0,
        revenue: 0,
        profit: 0,
        invested: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return buckets;
}

const SHORT_MONTHS = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];
const SHORT_WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function formatDayLabel(date: Date): string {
  return `${SHORT_WEEKDAYS[date.getDay()]}, ${date.getDate()}`;
}

function formatWeekLabel(weekStart: Date, weekEnd: Date): string {
  const startDay = weekStart.getDate();
  const endDay = weekEnd.getDate();
  const startMonth = SHORT_MONTHS[weekStart.getMonth()];
  const endMonth = SHORT_MONTHS[weekEnd.getMonth()];

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startDay}–${endDay} ${endMonth}`;
  }
  return `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}

function formatMonthLabel(date: Date, rangeStart: Date, rangeEnd: Date): string {
  const month = SHORT_MONTHS[date.getMonth()];
  if (rangeStart.getFullYear() !== rangeEnd.getFullYear()) {
    return `${month} '${String(date.getFullYear()).slice(2)}`;
  }
  return month;
}

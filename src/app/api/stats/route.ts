import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";

const statsQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  granularity: z.enum(["day", "week", "month"]).optional(),
});

type Granularity = "day" | "week" | "month";

// GET /api/stats — статистика клиента для дашборда
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверка premium доступа
    const isPremium =
      session.isVibePlus ||
      session.subscriptionTier === "premium" ||
      session.subscriptionTier === "top_floor_boss";

    if (!isPremium) {
      return NextResponse.json({ error: "Доступно только для Premium" }, { status: 403 });
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
    const now = new Date();

    // Определяем диапазон дат
    let startDate: Date;
    let endDate: Date;

    if (paramDateFrom) {
      startDate = new Date(paramDateFrom);
      startDate.setHours(0, 0, 0, 0);
    } else {
      // Без dateFrom — находим дату первого заказа
      const { data: firstOrder } = await supabase
        .from("orders")
        .select("created_at")
        .eq("client_id", session.userId)
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

    // Авто-определение гранулярности по длине диапазона
    const daySpan =
      Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const granularity: Granularity =
      paramGranularity ?? (daySpan <= 14 ? "day" : daySpan <= 90 ? "week" : "month");

    // Получаем заказы за период
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, status, client_price, sale_price, client_profit, created_at")
      .eq("client_id", session.userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Stats fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки статистики" }, { status: 500 });
    }

    // Получаем активные заказы (в работе) — без фильтра по дате
    const activeStatuses = ["awaiting_shipment", "collecting", "in_transit"];
    const { data: activeOrders } = await supabase
      .from("orders")
      .select("id, client_price")
      .eq("client_id", session.userId)
      .in("status", activeStatuses);

    const inProgressCount = activeOrders?.length || 0;
    const inProgressAmount = activeOrders?.reduce((sum, o) => sum + (o.client_price || 0), 0) || 0;

    // Генерируем бакеты по гранулярности
    const buckets = generateBuckets(startDate, endDate, granularity);

    // Статусы, которые НЕ учитываем в статистике
    const excludedStatuses = ["cancelled", "disposed", "trash"];

    // Заполняем бакеты данными
    let totalOrders = 0;
    let totalInvested = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let completedOrders = 0;

    for (const order of orders || []) {
      if (!order.status || !order.created_at || excludedStatuses.includes(order.status)) {
        continue;
      }

      const orderDate = new Date(order.created_at);
      const bucketKey = getBucketKey(orderDate, granularity);
      const bucket = buckets.get(bucketKey);

      if (bucket) {
        bucket.orders += 1;
        bucket.invested += order.client_price || 0;

        if (order.status === "completed") {
          bucket.revenue += order.sale_price || 0;
          bucket.profit += order.client_profit || 0;
        }
      }

      totalOrders += 1;
      totalInvested += order.client_price || 0;

      if (order.status === "completed") {
        totalRevenue += order.sale_price || 0;
        totalProfit += order.client_profit || 0;
        completedOrders += 1;
      }
    }

    // Преобразуем в массив для графика
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
    console.error("Stats API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// === Хелперы ===

/** YYYY-MM-DD в локальном времени */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Ключ бакета для даты по гранулярности */
function getBucketKey(date: Date, granularity: Granularity): string {
  if (granularity === "day") {
    return toDateKey(date);
  }
  if (granularity === "week") {
    // Начало недели (понедельник)
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Если воскресенье — назад на 6 дней
    d.setDate(d.getDate() + diff);
    return toDateKey(d);
  }
  // month
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

/** Генерирует все бакеты от startDate до endDate с нулями */
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
    // Начинаем с понедельника недели, содержащей startDate
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
    // month
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

/** Лейбл для дневной свечи: "пн, 3" */
function formatDayLabel(date: Date): string {
  const weekday = SHORT_WEEKDAYS[date.getDay()];
  const day = date.getDate();
  return `${weekday}, ${day}`;
}

/** Лейбл для недельной свечи: "3–9 фев" */
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

/** Лейбл для месячной свечи: "янв" или "янв '25" */
function formatMonthLabel(date: Date, rangeStart: Date, rangeEnd: Date): string {
  const month = SHORT_MONTHS[date.getMonth()];
  // Если диапазон охватывает несколько лет — добавляем год
  if (rangeStart.getFullYear() !== rangeEnd.getFullYear()) {
    return `${month} '${String(date.getFullYear()).slice(2)}`;
  }
  return month;
}

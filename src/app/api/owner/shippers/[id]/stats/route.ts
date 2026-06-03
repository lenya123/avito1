import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { MOSCOW_TZ } from "@/lib/utils/moscow-time";

function moscowDateStr(date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: MOSCOW_TZ });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    // Verify shipper exists
    const { data: shipper, error: shipperError } = await supabase
      .from("users")
      .select(
        "id, name, telegram_username, phone, shipper_score, work_days, work_hour_start, work_hour_end, created_at"
      )
      .eq("id", id)
      .eq("role", "shipper")
      .single();

    if (shipperError || !shipper) {
      return NextResponse.json({ error: "Отправщик не найден" }, { status: 404 });
    }

    const today = moscowDateStr();
    const monthStartStr = today.slice(0, 7) + "-01";

    // Chart period from query params (defaults to current month)
    const url = new URL(request.url);
    const chartFrom = url.searchParams.get("dateFrom") || monthStartStr;
    const chartTo = url.searchParams.get("dateTo") || today;

    const [
      todayStatsRes,
      monthStatsRes,
      chartStatsRes,
      allTimeStatsRes,
      monthPayoutsRes,
      allPayoutsRes,
      settingsRes,
    ] = await Promise.all([
      supabase.from("shipper_stats").select("*").eq("shipper_id", id).eq("date", today).single(),
      supabase
        .from("shipper_stats")
        .select(
          "date, orders_shipped, orders_taken, returns_collected, earnings, rate_applied, orders_available"
        )
        .eq("shipper_id", id)
        .gte("date", monthStartStr)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("shipper_stats")
        .select("date, orders_shipped, orders_taken, returns_collected, earnings")
        .eq("shipper_id", id)
        .gte("date", chartFrom)
        .lte("date", chartTo)
        .order("date", { ascending: true }),
      supabase
        .from("shipper_stats")
        .select("orders_shipped, orders_taken, returns_collected, earnings")
        .eq("shipper_id", id),
      supabase
        .from("shipper_payouts")
        .select("amount")
        .eq("shipper_id", id)
        .gte("created_at", monthStartStr + "T00:00:00.000Z"),
      supabase
        .from("shipper_payouts")
        .select("id, amount, note, created_at")
        .eq("shipper_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("settings")
        .select(
          "shipper_payment_mode, shipper_fixed_rate, pendulum_rate_min, pendulum_rate_max, shipper_penalty_rate"
        )
        .single(),
    ]);

    const todayStats = todayStatsRes.data;
    const monthStats = monthStatsRes.data;
    const chartStats = chartStatsRes.data;
    const allTimeStats = allTimeStatsRes.data;
    const settings = settingsRes.data as Record<string, unknown> | null;
    const workDays = shipper.work_days as number[] | null;

    const monthPayoutsTotal = (monthPayoutsRes.data || []).reduce(
      (sum, row) => sum + (row.amount || 0),
      0
    );

    const paymentMode: "pendulum" | "fixed" =
      settings?.shipper_payment_mode === "fixed" ? "fixed" : "pendulum";
    const fixedRate = (settings?.shipper_fixed_rate as number) || 150;
    const rateMin = (settings?.pendulum_rate_min as number) || 100;
    const rateMax = (settings?.pendulum_rate_max as number) || 250;
    const penaltyRate = (settings?.shipper_penalty_rate as number) || 0;
    const shipperRate = paymentMode === "fixed" ? fixedRate : Math.round((rateMin + rateMax) / 2);

    // Aggregate helper
    const aggregate = (
      data:
        | {
            orders_shipped: number | null;
            orders_taken?: number | null;
            returns_collected: number | null;
            earnings: number | null;
          }[]
        | null
    ) => {
      if (!data) return { orders: 0, ordersTaken: 0, returns: 0, earnings: 0 };
      return data.reduce(
        (acc, row) => ({
          orders: acc.orders + (row.orders_shipped || 0),
          ordersTaken: acc.ordersTaken + (row.orders_taken || 0),
          returns: acc.returns + (row.returns_collected || 0),
          earnings: acc.earnings + (row.earnings || 0),
        }),
        { orders: 0, ordersTaken: 0, returns: 0, earnings: 0 }
      );
    };

    // Процент успешных отправок = orders_shipped / orders_taken.
    // Если orders_taken=0 — возвращаем null (нечего считать), UI покажет «—».
    const successRate = (orders: number, ordersTaken: number): number | null =>
      ordersTaken > 0 ? Math.round((orders / ordersTaken) * 100) : null;

    // Auto-determine granularity like /api/stats
    const startDate = new Date(chartFrom + "T00:00:00");
    const endDate = new Date(chartTo + "T00:00:00");
    const daySpan =
      Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const chartGranularity: "day" | "week" | "month" =
      daySpan <= 31 ? "day" : daySpan <= 90 ? "week" : "month";

    // Aggregate into buckets
    const buckets = new Map<
      string,
      { date: string; label: string; orders: number; earnings: number }
    >();

    const getBucketKey = (dateStr: string): string => {
      const d = new Date(dateStr + "T00:00:00");
      if (chartGranularity === "day") return dateStr;
      if (chartGranularity === "week") {
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    };

    const formatLabel = (dateStr: string): string => {
      const d = new Date(dateStr + "T00:00:00");
      if (chartGranularity === "day") {
        return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      }
      if (chartGranularity === "week") {
        return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      }
      return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
    };

    // Generate empty buckets
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const key = getBucketKey(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
      );
      if (!buckets.has(key)) {
        buckets.set(key, { date: key, label: formatLabel(key), orders: 0, earnings: 0 });
      }
      if (chartGranularity === "day") cursor.setDate(cursor.getDate() + 1);
      else if (chartGranularity === "week") cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
    }

    // Fill buckets with data
    for (const row of chartStats || []) {
      const key = getBucketKey(row.date);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.orders += row.orders_shipped || 0;
        bucket.earnings += row.earnings || 0;
      }
    }

    const dailyHistory = Array.from(buckets.values());

    const monthAgg = aggregate(monthStats);
    const allTimeAgg = aggregate(allTimeStats);

    // Efficiency / ELO (pendulum mode)
    let efficiency = null;
    if (paymentMode === "pendulum") {
      const score = Math.max(0, Math.min(100, Number(shipper.shipper_score ?? 65)));

      const monthStart = new Date(monthStartStr + "T00:00:00Z");
      const todayDate = new Date(today + "T00:00:00Z");
      let workDaysPassed = 0;
      const d = new Date(monthStart);
      while (d <= todayDate) {
        const dow = d.getUTCDay();
        if (!workDays || workDays.length === 0 || workDays.includes(dow)) {
          workDaysPassed++;
        }
        d.setUTCDate(d.getUTCDate() + 1);
      }

      const daysActive = (monthStats || []).filter((r) => (r.orders_shipped || 0) > 0).length;

      // S-curve
      let factor: number;
      if (score <= 50) {
        factor = (score / 50) * 0.15;
      } else if (score <= 80) {
        factor = 0.15 + ((score - 50) / 30) * 0.35;
      } else {
        factor = 0.5 + ((score - 80) / 20) * 0.5;
      }
      const currentRate = Math.round(rateMin + factor * (rateMax - rateMin));

      efficiency = {
        value: Math.round(score),
        daysActive,
        workDaysPassed,
        currentRate,
        rateMin,
        rateMax,
        penaltyRate,
      };
    }

    return NextResponse.json({
      shipper: {
        id: shipper.id,
        name: shipper.name,
        telegramUsername: shipper.telegram_username,
        phone: shipper.phone,
        shipperScore: shipper.shipper_score ?? 65,
        workDays: shipper.work_days || null,
        workHourStart: shipper.work_hour_start ?? 9,
        workHourEnd: shipper.work_hour_end ?? 18,
        createdAt: shipper.created_at,
      },
      stats: {
        today: {
          orders: todayStats?.orders_shipped || 0,
          ordersTaken: todayStats?.orders_taken || 0,
          returns: todayStats?.returns_collected || 0,
          earnings: todayStats?.earnings || 0,
          ordersAvailable: todayStats?.orders_available || 0,
          successRate: successRate(todayStats?.orders_shipped || 0, todayStats?.orders_taken || 0),
        },
        month: {
          ...monthAgg,
          successRate: successRate(monthAgg.orders, monthAgg.ordersTaken),
        },
        allTime: {
          ...allTimeAgg,
          successRate: successRate(allTimeAgg.orders, allTimeAgg.ordersTaken),
        },
        dailyHistory,
        chartGranularity,
        shipperRate,
        monthPayouts: monthPayoutsTotal,
        pendingPayout: monthAgg.earnings - monthPayoutsTotal,
        paymentMode,
        efficiency,
      },
      payouts: allPayoutsRes.data || [],
    });
  } catch (error) {
    console.error("Owner shipper stats error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

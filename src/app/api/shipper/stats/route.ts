import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { MOSCOW_TZ } from "@/lib/utils/moscow-time";

function moscowDateStr(date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: MOSCOW_TZ });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const today = moscowDateStr();
    const monthStartStr = today.slice(0, 7) + "-01";

    const [todayStatsRes, monthStatsRes, allTimeStatsRes, monthPayoutsRes, settingsRes, userRes] =
      await Promise.all([
        supabase
          .from("shipper_stats")
          .select("*")
          .eq("shipper_id", session.userId)
          .eq("date", today)
          .single(),
        supabase
          .from("shipper_stats")
          .select("date, orders_shipped, returns_collected, earnings, rate_applied")
          .eq("shipper_id", session.userId)
          .gte("date", monthStartStr)
          .lte("date", today)
          .order("date", { ascending: true }),
        supabase
          .from("shipper_stats")
          .select("orders_shipped, returns_collected, earnings")
          .eq("shipper_id", session.userId),
        supabase
          .from("shipper_payouts")
          .select("amount")
          .eq("shipper_id", session.userId)
          .gte("created_at", monthStartStr + "T00:00:00.000Z"),
        supabase
          .from("settings")
          .select(
            "shipper_payment_mode, shipper_fixed_rate, pendulum_rate_min, pendulum_rate_max, shipper_penalty_rate"
          )
          .single(),
        supabase.from("users").select("work_days, shipper_score").eq("id", session.userId).single(),
      ]);

    const todayStats = todayStatsRes.data;
    const monthStats = monthStatsRes.data;
    const allTimeStats = allTimeStatsRes.data;
    const settings = settingsRes.data as Record<string, unknown> | null;
    const workDays: number[] | null = (userRes.data as Record<string, unknown>)?.work_days as
      | number[]
      | null;

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

    // ─── Aggregate ───────────────────────────────────────────────
    const aggregate = (
      data:
        | {
            orders_shipped: number | null;
            returns_collected: number | null;
            earnings: number | null;
          }[]
        | null
    ) => {
      if (!data) return { orders: 0, returns: 0, earnings: 0 };
      return data.reduce(
        (acc, row) => ({
          orders: acc.orders + (row.orders_shipped || 0),
          returns: acc.returns + (row.returns_collected || 0),
          earnings: acc.earnings + (row.earnings || 0),
        }),
        { orders: 0, returns: 0, earnings: 0 }
      );
    };

    const dailyHistory = (monthStats || []).map((row) => ({
      date: row.date,
      orders: row.orders_shipped || 0,
      earnings: row.earnings || 0,
    }));

    const monthAgg = aggregate(monthStats);
    const allTimeAgg = aggregate(allTimeStats);
    const todayOrders = todayStats?.orders_shipped || 0;

    // ─── Efficiency / ELO score (dynamic mode) ────────────────────
    let efficiency = null;

    if (paymentMode === "pendulum") {
      const userData = userRes.data as Record<string, unknown> | null;
      const score = Math.max(0, Math.min(100, Number(userData?.shipper_score ?? 50)));

      // Count work days passed this month
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
      // S-кривая: декселератор (0-50) → стандарт (50-80) → акселератор (80-100)
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

    // ─── Response ────────────────────────────────────────────────
    const stats = {
      today: {
        orders: todayOrders,
        returns: todayStats?.returns_collected || 0,
        earnings: todayStats?.earnings || 0,
      },
      month: {
        orders: monthAgg.orders,
        returns: monthAgg.returns,
        earnings: monthAgg.earnings,
      },
      allTime: {
        orders: allTimeAgg.orders,
        returns: allTimeAgg.returns,
        earnings: allTimeAgg.earnings,
      },
      dailyHistory,
      shipperRate,
      monthPayouts: monthPayoutsTotal,
      pendingPayout: monthAgg.earnings - monthPayoutsTotal,
      paymentMode,
      efficiency,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Shipper stats error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

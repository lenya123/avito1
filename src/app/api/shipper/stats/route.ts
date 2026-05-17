import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";

// ─── Helpers ────────────────────────────────────────────────────────

function moscowDateStr(date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/** Days between two YYYY-MM-DD strings */
function daysBetween(a: string, b: string): number {
  const msA = new Date(a + "T00:00:00Z").getTime();
  const msB = new Date(b + "T00:00:00Z").getTime();
  return Math.round((msB - msA) / (1000 * 60 * 60 * 24));
}

// ─── Pendulum scoring ───────────────────────────────────────────────

const IDLE_PENALTY_PER_DAY = -10; // 10 idle days → -100
const MAX_POSITIVE_DELTA = 10; // 10 perfect days: 0 → +100
const MAX_NEGATIVE_DELTA = -20; // 5 terrible days: 0 → -100

/**
 * Convert volume % to a raw score (-100..+100).
 * 0% → -100, 70% → 0, 100% → +50, 150%+ → +100
 */
function volumeToRaw(pct: number): number {
  if (pct >= 70) {
    return clamp(((pct - 70) / 80) * 100, 0, 100);
  }
  return ((pct - 70) / 70) * 100; // 70→0, 0→-100
}

/**
 * Convert avg hours to a raw score (-100..+100).
 * 0h → +100, target → 0, 2×target → -100
 */
function speedToRaw(avgHours: number, target: number): number {
  if (avgHours <= target) {
    return ((target - avgHours) / target) * 100; // target→0, 0→+100
  }
  const overRatio = (avgHours - target) / target;
  return clamp(-overRatio * 100, -100, 0); // target→0, 2×target→-100
}

/**
 * Apply asymmetry to a raw score (-100..+100) → delta.
 * Positive: max +10/day (hard to climb)
 * Negative: max -20/day (easy to fall)
 */
function rawToDelta(raw: number): number {
  if (raw > 0) {
    return (raw / 100) * Math.abs(MAX_POSITIVE_DELTA);
  }
  return (raw / 100) * Math.abs(MAX_NEGATIVE_DELTA);
}

/** Linear interpolation of rate based on score */
function scoreToRate(score: number, rateMin: number, rateBase: number, rateMax: number): number {
  if (score >= 0) {
    return Math.round(rateBase + (score / 100) * (rateMax - rateBase));
  }
  return Math.round(rateBase + (score / 100) * (rateBase - rateMin));
}

// ─── Route ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const today = moscowDateStr();
    const monthStartStr = today.slice(0, 7) + "-01";

    // 30 days ago for pendulum history
    const historyStart = new Date();
    historyStart.setDate(historyStart.getDate() - 30);
    const historyStartStr = moscowDateStr(historyStart);

    const [
      todayStatsRes,
      monthStatsRes,
      allTimeStatsRes,
      monthPayoutsRes,
      settingsRes,
      recentStatsRes,
      userRes,
    ] = await Promise.all([
      supabase
        .from("shipper_stats")
        .select("*")
        .eq("shipper_id", session.userId)
        .eq("date", today)
        .single(),
      supabase
        .from("shipper_stats")
        .select("date, orders_shipped, returns_collected, earnings, daily_bonus")
        .eq("shipper_id", session.userId)
        .gte("date", monthStartStr)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("shipper_stats")
        .select("orders_shipped, returns_collected, earnings, daily_bonus")
        .eq("shipper_id", session.userId),
      supabase
        .from("shipper_payouts")
        .select("amount")
        .eq("shipper_id", session.userId)
        .gte("created_at", monthStartStr + "T00:00:00.000Z"),
      supabase
        .from("settings")
        .select(
          "shipper_rate, shipper_payment_mode, shipper_fixed_rate, pendulum_rate_min, pendulum_rate_base, pendulum_rate_max, pendulum_speed_target_hours, pendulum_avg_window_days"
        )
        .single(),
      // Shipper's last 30 days of stats for pendulum history walk
      supabase
        .from("shipper_stats")
        .select("date, orders_shipped")
        .eq("shipper_id", session.userId)
        .gte("date", historyStartStr)
        .lt("date", today) // exclude today — today is real-time
        .order("date", { ascending: true }),
      // Shipper's work_days
      supabase.from("users").select("work_days").eq("id", session.userId).single(),
    ]);

    const todayStats = todayStatsRes.data;
    const monthStats = monthStatsRes.data;
    const allTimeStats = allTimeStatsRes.data;
    const settings = settingsRes.data as Record<string, unknown> | null;
    const recentStats = recentStatsRes.data || [];
    const workDays: number[] | null = (userRes.data as Record<string, unknown>)?.work_days as
      | number[]
      | null;

    const monthPayoutsTotal = (monthPayoutsRes.data || []).reduce(
      (sum, row) => sum + (row.amount || 0),
      0
    );

    const paymentMode: "dynamic" | "fixed" =
      settings?.shipper_payment_mode === "fixed" ? "fixed" : "dynamic";
    const fixedRate = (settings?.shipper_fixed_rate as number) || 150;
    const shipperRate =
      paymentMode === "fixed" ? fixedRate : (settings?.shipper_rate as number) || 150;

    // Pendulum settings
    const rateMin = (settings?.pendulum_rate_min as number) || 100;
    const rateBase = (settings?.pendulum_rate_base as number) || 150;
    const rateMax = (settings?.pendulum_rate_max as number) || 250;
    const speedTargetHours = Math.max((settings?.pendulum_speed_target_hours as number) || 24, 24);
    const avgWindowDays = (settings?.pendulum_avg_window_days as number) || 7;

    // ─── Aggregate helpers ────────────────────────────────────────
    const aggregateStats = (
      data:
        | {
            orders_shipped: number | null;
            returns_collected: number | null;
            earnings: number | null;
            daily_bonus?: number | null;
          }[]
        | null
    ) => {
      if (!data) return { orders: 0, returns: 0, earnings: 0, bonuses: 0 };
      return data.reduce(
        (acc, row) => ({
          orders: acc.orders + (row.orders_shipped || 0),
          returns: acc.returns + (row.returns_collected || 0),
          earnings: acc.earnings + (row.earnings || 0),
          bonuses: acc.bonuses + (row.daily_bonus || 0),
        }),
        { orders: 0, returns: 0, earnings: 0, bonuses: 0 }
      );
    };

    const dailyHistory = (monthStats || []).map((row) => ({
      date: row.date,
      orders: row.orders_shipped || 0,
      earnings: (row.earnings || 0) + (row.daily_bonus || 0),
    }));

    const monthAggregated = aggregateStats(monthStats);
    const allTimeAggregated = aggregateStats(allTimeStats);
    const todayOrders = todayStats?.orders_shipped || 0;

    // ─── Pendulum calculation ─────────────────────────────────────
    let pendulum = null;

    if (paymentMode === "dynamic") {
      // ── Daily target: system avg orders / active shippers ───────
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - avgWindowDays);
      const windowStartStr = moscowDateStr(windowStart);

      const [orderCountRes, activeShippersRes] = await Promise.all([
        // Total orders in the system over the window
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .gte("created_at", windowStartStr + "T00:00:00.000Z")
          .lt("created_at", today + "T00:00:00.000Z"),
        // Count distinct active shippers (who shipped at least 1 order in the window)
        supabase
          .from("shipper_stats")
          .select("shipper_id")
          .gte("date", windowStartStr)
          .gt("orders_shipped", 0),
      ]);

      const totalOrders = orderCountRes.count || 0;
      const activeShipperIds = new Set((activeShippersRes.data || []).map((r) => r.shipper_id));
      const activeShipperCount = Math.max(activeShipperIds.size, 1);

      const avgDailyOrders = totalOrders / Math.max(avgWindowDays, 1);
      const dailyTarget = Math.max(Math.round(avgDailyOrders / activeShipperCount), 1);
      const volumePercent = (todayOrders / dailyTarget) * 100;

      // ── Speed: awaiting_shipment → shipped_at + return_arrived → return_completed_at
      const { data: shippedToday } = await supabase
        .from("orders")
        .select("status_history, shipped_at")
        .eq("shipped_by", session.userId)
        .not("shipped_at", "is", null)
        .gte("shipped_at", today + "T00:00:00.000Z");

      const shipHours: number[] = [];
      if (shippedToday) {
        for (const order of shippedToday) {
          const history = (order.status_history || []) as Array<{
            status: string;
            timestamp: string;
          }>;
          const awaitingEntry = history.find((e) => e.status === "awaiting_shipment");
          if (awaitingEntry && order.shipped_at) {
            const available = new Date(awaitingEntry.timestamp).getTime();
            const shipped = new Date(order.shipped_at).getTime();
            shipHours.push((shipped - available) / (1000 * 60 * 60));
          }
        }
      }

      // Return pickups: return_arrived → return_completed_at
      const { data: returnsCompleted } = await supabase
        .from("orders")
        .select("status_history, return_completed_at")
        .eq("shipped_by", session.userId)
        .not("return_completed_at", "is", null)
        .gte("return_completed_at", today + "T00:00:00.000Z");

      const returnHours: number[] = [];
      if (returnsCompleted) {
        for (const order of returnsCompleted) {
          const history = (order.status_history || []) as Array<{
            status: string;
            timestamp: string;
          }>;
          const arrivedEntry = history.find((e) => e.status === "return_arrived");
          if (arrivedEntry && order.return_completed_at) {
            const arrived = new Date(arrivedEntry.timestamp).getTime();
            const completed = new Date(order.return_completed_at).getTime();
            returnHours.push((completed - arrived) / (1000 * 60 * 60));
          }
        }
      }

      const allHours = [...shipHours, ...returnHours];
      const avgHours =
        allHours.length > 0
          ? allHours.reduce((a, b) => a + b, 0) / allHours.length
          : speedTargetHours;

      // ── System orders per day (to know if there were orders on idle days) ──
      const { data: systemDailyOrders } = await supabase
        .from("orders")
        .select("created_at")
        .gte("created_at", historyStartStr + "T00:00:00.000Z")
        .lt("created_at", today + "T00:00:00.000Z");

      // Build a set of dates that had orders in the system
      const datesWithOrders = new Set<string>();
      if (systemDailyOrders) {
        for (const row of systemDailyOrders) {
          if (row.created_at) {
            datesWithOrders.add(row.created_at.slice(0, 10));
          }
        }
      }

      /** Get YYYY-MM-DD for a date offset from a base string */
      const addDays = (base: string, n: number): string => {
        const d = new Date(base + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
      };

      /** Check if a date string falls on a work day (0=Sun..6=Sat) */
      const isWorkDay = (dateStr: string): boolean => {
        if (!workDays || workDays.length === 0) return true; // No work days set — every day counts
        const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
        return workDays.includes(dow);
      };

      // ── Walk historical days to build accumulated score ─────────
      let score = 0;

      // Build a map of shipper's stats by date for quick lookup
      const shipperStatsByDate = new Map<string, number>();
      for (const row of recentStats) {
        shipperStatsByDate.set(row.date, row.orders_shipped || 0);
      }

      // Walk each day from historyStart+1 to yesterday
      const yesterday = addDays(today, -1);
      const totalDays = daysBetween(historyStartStr, yesterday);

      for (let i = 1; i <= totalDays; i++) {
        const dateStr = addDays(historyStartStr, i);
        const shipped = shipperStatsByDate.get(dateStr);

        if (shipped !== undefined && shipped > 0) {
          // Shipper worked this day — apply volume delta
          const dayPct = (shipped / dailyTarget) * 100;
          const dayRaw = volumeToRaw(dayPct);
          score = clamp(score + rawToDelta(dayRaw), -100, 100);
        } else if (datesWithOrders.has(dateStr) && isWorkDay(dateStr)) {
          // System had orders, it was a work day, but shipper didn't work — idle penalty
          score = clamp(score + IDLE_PENALTY_PER_DAY, -100, 100);
        }
        // Day off or no orders in system — no penalty
      }

      // ── Today's real-time delta (volume + speed) ────────────────
      if (todayOrders > 0) {
        const volRaw = volumeToRaw(volumePercent);
        const spdRaw = speedToRaw(avgHours, speedTargetHours);
        const todayRaw = (volRaw + spdRaw) / 2; // 50/50 weight
        score = clamp(score + rawToDelta(todayRaw), -100, 100);
      }
      // If no orders today — no delta yet (idle penalty applies at end of day)

      const currentRate = scoreToRate(score, rateMin, rateBase, rateMax);

      pendulum = {
        score: Math.round(score),
        volumePercent: Math.round(clamp(volumePercent, 0, 999)),
        dailyTarget,
        avgHours: Math.round(avgHours * 10) / 10,
        speedTargetHours,
        currentRate,
        rateMin,
        rateBase,
        rateMax,
      };
    }

    // ─── Response ─────────────────────────────────────────────────
    const totalMonthEarnings = monthAggregated.earnings + monthAggregated.bonuses;

    const stats = {
      today: {
        orders: todayOrders,
        returns: todayStats?.returns_collected || 0,
        earnings: todayStats?.earnings || 0,
      },
      month: {
        orders: monthAggregated.orders,
        returns: monthAggregated.returns,
        earnings: monthAggregated.earnings,
      },
      allTime: {
        orders: allTimeAggregated.orders,
        returns: allTimeAggregated.returns,
        earnings: allTimeAggregated.earnings + allTimeAggregated.bonuses,
      },
      dailyHistory,
      shipperRate,
      monthPayouts: monthPayoutsTotal,
      pendingPayout: totalMonthEarnings - monthPayoutsTotal,
      paymentMode,
      pendulum,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Shipper stats error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

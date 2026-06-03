import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { z } from "zod";

const querySchema = z.object({
  openAlertsOnly: z.enum(["true", "false"]).optional(),
  minReturnRate: z.coerce.number().optional(),
  minCancelRate: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(200).default(100),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      openAlertsOnly: searchParams.get("openAlertsOnly") ?? undefined,
      minReturnRate: searchParams.get("minReturnRate") ?? undefined,
      minCancelRate: searchParams.get("minCancelRate") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const supabase = createServiceClient();
    let query = supabase
      .from("customer_risk_profile")
      .select(
        "customer_id, name, telegram_username, is_frozen, is_blocked, total_orders, return_count, cancel_count, return_rate_pct, cancel_rate_pct, current_debt, vibe_limit, last_order_at, open_alerts_count"
      )
      .order("open_alerts_count", { ascending: false })
      .order("return_rate_pct", { ascending: false })
      .limit(params.limit);

    if (params.openAlertsOnly === "true") query = query.gt("open_alerts_count", 0);
    if (params.minReturnRate != null) query = query.gte("return_rate_pct", params.minReturnRate);
    if (params.minCancelRate != null) query = query.gte("cancel_rate_pct", params.minCancelRate);

    const { data, error } = await query;

    if (error) {
      console.error("Risk profiles fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({
      profiles: (data || []).map((p) => ({
        customerId: p.customer_id,
        name: p.name,
        telegramUsername: p.telegram_username,
        isFrozen: p.is_frozen,
        isBlocked: p.is_blocked,
        totalOrders: Number(p.total_orders || 0),
        returnCount: Number(p.return_count || 0),
        cancelCount: Number(p.cancel_count || 0),
        returnRatePct: Number(p.return_rate_pct || 0),
        cancelRatePct: Number(p.cancel_rate_pct || 0),
        currentDebt: Number(p.current_debt || 0),
        vibeLimit: Number(p.vibe_limit || 0),
        lastOrderAt: p.last_order_at,
        openAlertsCount: Number(p.open_alerts_count || 0),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Risk profiles API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

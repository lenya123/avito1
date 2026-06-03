import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { runOwnerAnalytics } from "@/lib/analytics/compute-owner-analytics";
import { getOwnerSession } from "@/lib/auth/session";

const querySchema = z.object({
  period: z.enum(["week", "month", "quarter", "year", "custom"]).default("month"),
  granularity: z.enum(["day", "week", "month"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  compare: z.string().optional(),
  // §15: фильтр канала сбыта.
  channel: z.enum(["all", "drop", "avito"]).default("all"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      period: searchParams.get("period") ?? undefined,
      granularity: searchParams.get("granularity") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      compare: searchParams.get("compare") ?? undefined,
      channel: searchParams.get("channel") ?? undefined,
    });

    const supabase = createServiceClient();

    const result = await runOwnerAnalytics({
      supabase,
      period: params.period,
      granularity: params.granularity,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      compare: params.compare === "true",
      channel: params.channel,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analytics API error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

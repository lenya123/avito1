/**
 * GET /api/owner/ai-sales/stats — статистика AI-продажника
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  days: z.coerce.number().min(1).max(90).default(7),
});

export async function GET(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      days: searchParams.get("days") ?? undefined,
    });

    const supabase = createServiceClient();

    // Определяем диапазон дат
    const dateTo =
      params.to || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
    const dateFrom =
      params.from ||
      new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
        timeZone: "Europe/Moscow",
      });

    // Дневная статистика
    const { data: daily } = await supabase
      .from("ai_sales_daily_stats")
      .select("*")
      .eq("user_id", session.userId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true });

    // Агрегированные итоги
    const totals = (daily || []).reduce(
      (acc, d) => {
        acc.totalIncoming += d.total_incoming || 0;
        acc.totalDrafts += d.total_drafts || 0;
        acc.totalApproved += d.total_approved || 0;
        acc.totalEdited += d.total_edited || 0;
        acc.totalRejected += d.total_rejected || 0;
        acc.totalAutoSent += d.total_auto_sent || 0;
        acc.totalExpired += d.total_expired || 0;
        acc.totalTokens += d.total_tokens || 0;
        acc.estimatedCostUsd += Number(d.estimated_cost_usd) || 0;
        return acc;
      },
      {
        totalIncoming: 0,
        totalDrafts: 0,
        totalApproved: 0,
        totalEdited: 0,
        totalRejected: 0,
        totalAutoSent: 0,
        totalExpired: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      }
    );

    // Средний approval rate
    const daysWithRate = (daily || []).filter((d) => d.approval_rate !== null);
    const avgApprovalRate = daysWithRate.length
      ? parseFloat(
          (
            daysWithRate.reduce((s, d) => s + Number(d.approval_rate), 0) / daysWithRate.length
          ).toFixed(1)
        )
      : null;

    // Текущие pending черновики
    const { count: pendingCount } = await supabase
      .from("ai_sales_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.userId)
      .eq("status", "pending");

    return NextResponse.json({
      daily: (daily || []).map((d) => ({
        date: d.date,
        totalIncoming: d.total_incoming,
        totalDrafts: d.total_drafts,
        totalApproved: d.total_approved,
        totalEdited: d.total_edited,
        totalRejected: d.total_rejected,
        totalAutoSent: d.total_auto_sent,
        totalExpired: d.total_expired,
        avgGenerationTimeMs: d.avg_generation_time_ms,
        avgReviewTimeSec: d.avg_review_time_sec,
        avgResponseTimeSec: d.avg_response_time_sec,
        approvalRate: d.approval_rate,
        correctionRate: d.correction_rate,
        totalTokens: d.total_tokens,
        estimatedCostUsd: d.estimated_cost_usd,
      })),
      totals: {
        ...totals,
        estimatedCostUsd: parseFloat(totals.estimatedCostUsd.toFixed(4)),
        avgApprovalRate,
      },
      pendingCount: pendingCount || 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    }
    console.error("[AI Sales] Stats API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

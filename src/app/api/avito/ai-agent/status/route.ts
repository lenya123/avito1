import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function getUserIdFromSession(request: NextRequest): string | null {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;
  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    return sessionData.userId || null;
  } catch {
    return null;
  }
}

// GET — статус AI-агента продаж (lightweight, для дашборда)
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Параллельно: настройки + сегодняшняя статистика + pending черновики
    const today = new Date().toISOString().slice(0, 10);

    const [settingsResult, dailyStatsResult, pendingResult] = await Promise.all([
      supabase.from("ai_sales_settings").select("is_enabled, mode").eq("user_id", userId).single(),
      supabase
        .from("ai_sales_daily_stats")
        .select("total_incoming, total_drafts, total_approved, total_auto_sent")
        .eq("user_id", userId)
        .eq("date", today)
        .single(),
      supabase
        .from("ai_sales_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending"),
    ]);

    const settings = settingsResult.data;
    const dailyStats = dailyStatsResult.data;

    return NextResponse.json({
      isEnabled: settings?.is_enabled ?? false,
      mode: settings?.mode ?? null,
      todayStats: {
        incoming: dailyStats?.total_incoming ?? 0,
        drafts: dailyStats?.total_drafts ?? 0,
        approved: dailyStats?.total_approved ?? 0,
        autoSent: dailyStats?.total_auto_sent ?? 0,
      },
      pendingDrafts: pendingResult.count ?? 0,
    });
  } catch (error) {
    console.error("[Avito AI Agent Status] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";


/** GET — owner notifications from activity_log */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 20), 50);
    const offset = Number(searchParams.get("offset") || 0);

    const supabase = createServiceClient();

    // Fetch recent activity log entries
    const {
      data: activities,
      error,
      count,
    } = await supabase
      .from("activity_log")
      .select("id, action, entity_type, entity_id, details, created_at, user_id", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Notifications fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    // Get recent count (last 24h) for badge
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo);

    return NextResponse.json({
      items: (activities || []).map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        details: a.details,
        createdAt: a.created_at,
        userId: a.user_id,
      })),
      total: count || 0,
      recentCount: recentCount || 0,
    });
  } catch (error) {
    console.error("Owner notifications GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

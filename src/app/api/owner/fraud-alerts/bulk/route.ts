import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

/** PATCH — bulk resolve fraud alerts */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const body = await request.json();
    const { alertIds } = body as { alertIds?: string[] };

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return NextResponse.json({ error: "Нет ID алертов" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("fraud_alerts")
      .update({
        status: "resolved",
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: session.userId,
      })
      .in("id", alertIds);

    if (error) {
      console.error("Bulk resolve error:", error);
      return NextResponse.json({ error: "Ошибка" }, { status: 500 });
    }

    // Activity log (одна запись для bulk)
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "alert_status_change",
      entity_type: "fraud_alert",
      details: { status: "resolved", alertIds, count: alertIds.length, bulk: true },
    });

    return NextResponse.json({ success: true, resolved: alertIds.length });
  } catch (error) {
    console.error("Bulk resolve API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

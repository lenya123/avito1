import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";


/** PATCH — update fraud alert status (investigating / resolved) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { status, resolution_note } = body as { status?: string; resolution_note?: string };

    const supabase = createServiceClient();
    const updateData: Record<string, unknown> = {};

    if (status === "investigating") {
      updateData.status = "investigating";
    } else {
      // Default: resolve (backward compat if no body sent)
      updateData.status = "resolved";
      updateData.is_resolved = true;
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = session.userId;
      if (resolution_note) updateData.resolution_note = resolution_note;
    }

    const { error } = await supabase.from("fraud_alerts").update(updateData).eq("id", id);

    if (error) {
      console.error("Fraud alert update error:", error);
      return NextResponse.json({ error: "Ошибка" }, { status: 500 });
    }

    // Запись в activity_log
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "alert_status_change",
      entity_type: "fraud_alert",
      entity_id: id,
      details: { status: status || "resolved", note: resolution_note },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fraud alert PATCH error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

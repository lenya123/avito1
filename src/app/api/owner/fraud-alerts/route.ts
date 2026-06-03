import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("fraud_alerts")
      .select(
        "id, alert_type, severity, customer_id, details, is_resolved, status, created_at, customer:customers(id, name, telegram_username)"
      )
      .eq("is_resolved", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Fraud alerts fetch error:", error);
      return NextResponse.json({ alerts: [] });
    }

    return NextResponse.json({
      alerts: (data || []).map((a) => ({
        id: a.id,
        alertType: a.alert_type,
        severity: a.severity,
        customerId: a.customer_id,
        customer: a.customer
          ? {
              id: a.customer.id,
              name: a.customer.name,
              telegramUsername: a.customer.telegram_username,
            }
          : null,
        details: a.details,
        isResolved: a.is_resolved,
        status: a.status,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error("Fraud alerts GET error:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

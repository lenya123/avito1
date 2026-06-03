import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

// POST /api/owner/security/run-detectors — ручной запуск fraud-детекторов.
// Кроме этого есть суточный cron (queues.ts → scheduleFraudDetectorsDaily).
export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("run_fraud_detectors");

    if (error) {
      console.error("run_fraud_detectors RPC error:", error);
      return NextResponse.json({ error: "Ошибка запуска детекторов" }, { status: 500 });
    }

    return NextResponse.json({ success: true, insertedAlerts: Number(data ?? 0) });
  } catch (error) {
    console.error("run-detectors API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

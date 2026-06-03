import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { buildDashboard } from "@/lib/services/dashboard";

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const data = await buildDashboard({ supabase });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Owner dashboard API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

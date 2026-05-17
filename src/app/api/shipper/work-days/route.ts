import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";

const setWorkDaysSchema = z.object({
  workDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Дни не должны повторяться"),
});

/** GET — get shipper's work days + min_work_days setting */
export async function GET(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const [userRes, settingsRes] = await Promise.all([
      supabase.from("users").select("work_days").eq("id", session.userId).single(),
      supabase.from("settings").select("min_work_days").single(),
    ]);

    return NextResponse.json({
      workDays: userRes.data?.work_days || null,
      minWorkDays: (settingsRes.data as Record<string, unknown>)?.min_work_days || 4,
    });
  } catch (error) {
    console.error("Work days GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/** POST — shipper sets work days (only if not set yet) */
export async function POST(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check if already set
    const { data: user } = await supabase
      .from("users")
      .select("work_days")
      .eq("id", session.userId)
      .single();

    if (user?.work_days && user.work_days.length > 0) {
      return NextResponse.json(
        { error: "Рабочие дни уже установлены. Обратись к владельцу для изменения." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = setWorkDaysSchema.parse(body);

    // Check min_work_days
    const { data: settings } = await supabase.from("settings").select("min_work_days").single();

    const minDays = ((settings as Record<string, unknown>)?.min_work_days as number) || 4;
    if (data.workDays.length < minDays) {
      return NextResponse.json({ error: `Минимум ${minDays} рабочих дней` }, { status: 400 });
    }

    // Sort days for consistency
    const sorted = [...data.workDays].sort((a, b) => a - b);

    const { error } = await supabase
      .from("users")
      .update({ work_days: sorted })
      .eq("id", session.userId);

    if (error) {
      console.error("Work days update error:", error);
      return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
    }

    return NextResponse.json({ success: true, workDays: sorted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Work days POST error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

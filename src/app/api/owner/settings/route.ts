import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

async function getOwnerSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    if (session.role !== "owner") return null;
    return session;
  } catch {
    return null;
  }
}

const PENDULUM_FIELDS =
  "shipper_payment_mode, shipper_fixed_rate, pendulum_rate_min, pendulum_rate_base, pendulum_rate_max, pendulum_speed_target_hours, pendulum_avg_window_days, min_work_days";

/** GET — owner gets pendulum settings */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.from("settings").select(PENDULUM_FIELDS).single();

    if (error) {
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    const s = data as Record<string, unknown>;
    return NextResponse.json({
      paymentMode: (s.shipper_payment_mode as string) === "fixed" ? "fixed" : "dynamic",
      fixedRate: (s.shipper_fixed_rate as number) || 150,
      rateMin: (s.pendulum_rate_min as number) || 100,
      rateBase: (s.pendulum_rate_base as number) || 150,
      rateMax: (s.pendulum_rate_max as number) || 250,
      speedTargetHours: (s.pendulum_speed_target_hours as number) || 24,
      avgWindowDays: (s.pendulum_avg_window_days as number) || 7,
      minWorkDays: (s.min_work_days as number) || 4,
    });
  } catch (error) {
    console.error("Owner settings GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const updateSchema = z.object({
  paymentMode: z.enum(["fixed", "dynamic"]).optional(),
  fixedRate: z.number().positive().optional(),
  rateMin: z.number().positive().optional(),
  rateBase: z.number().positive().optional(),
  rateMax: z.number().positive().optional(),
  speedTargetHours: z.number().min(24).max(168).optional(),
  avgWindowDays: z.number().int().min(1).max(30).optional(),
  minWorkDays: z.number().int().min(1).max(7).optional(),
});

/** PATCH — owner updates pendulum settings */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const supabase = createServiceClient();
    const update: Record<string, number | string> = {};

    if (data.paymentMode !== undefined) update.shipper_payment_mode = data.paymentMode;
    if (data.fixedRate !== undefined) update.shipper_fixed_rate = data.fixedRate;
    if (data.rateMin !== undefined) update.pendulum_rate_min = data.rateMin;
    if (data.rateBase !== undefined) update.pendulum_rate_base = data.rateBase;
    if (data.rateMax !== undefined) update.pendulum_rate_max = data.rateMax;
    if (data.speedTargetHours !== undefined)
      update.pendulum_speed_target_hours = data.speedTargetHours;
    if (data.avgWindowDays !== undefined) update.pendulum_avg_window_days = data.avgWindowDays;
    if (data.minWorkDays !== undefined) update.min_work_days = data.minWorkDays;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Нет данных" }, { status: 400 });
    }

    const { error } = await supabase.from("settings").update(update).not("id", "is", null);

    if (error) {
      console.error("Owner settings update error:", error);
      return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Owner settings PATCH error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

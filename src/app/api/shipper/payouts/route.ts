import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";

const createPayoutSchema = z.object({
  amount: z.number().positive("Сумма должна быть больше 0"),
  note: z.string().max(500).optional(),
});

const updateSettingsSchema = z.object({
  rateMin: z.number().positive().optional(),
  rateBase: z.number().positive().optional(),
  rateMax: z.number().positive().optional(),
  speedTargetHours: z.number().min(24).max(168).optional(),
  avgWindowDays: z.number().int().min(1).max(30).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("shipper_payouts")
      .select("id, amount, note, created_at")
      .eq("shipper_id", session.userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Payouts fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({ payouts: data || [] });
  } catch (error) {
    console.error("Shipper payouts error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = createPayoutSchema.parse(body);

    const supabase = createServiceClient();

    const { data: payout, error } = await supabase
      .from("shipper_payouts")
      .insert({
        shipper_id: session.userId,
        amount: data.amount,
        note: data.note || null,
      })
      .select("id, amount, note, created_at")
      .single();

    if (error) {
      console.error("Payout create error:", error);
      return NextResponse.json({ error: "Ошибка записи выплаты" }, { status: 500 });
    }

    return NextResponse.json({ success: true, payout });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Payout create error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = updateSettingsSchema.parse(body);

    const supabase = createServiceClient();

    const settingsUpdate: Record<string, number> = {};
    if (data.rateMin !== undefined) settingsUpdate.pendulum_rate_min = data.rateMin;
    if (data.rateBase !== undefined) settingsUpdate.pendulum_rate_base = data.rateBase;
    if (data.rateMax !== undefined) settingsUpdate.pendulum_rate_max = data.rateMax;
    if (data.speedTargetHours !== undefined)
      settingsUpdate.pendulum_speed_target_hours = data.speedTargetHours;
    if (data.avgWindowDays !== undefined)
      settingsUpdate.pendulum_avg_window_days = data.avgWindowDays;

    if (Object.keys(settingsUpdate).length > 0) {
      const { error } = await supabase
        .from("settings")
        .update(settingsUpdate)
        .not("id", "is", null);

      if (error) {
        console.error("Settings update error:", error);
        return NextResponse.json({ error: "Ошибка обновления настроек" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Settings update error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

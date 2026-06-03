import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";

/**
 * Эндпоинт выплат отправщика — ТОЛЬКО чтение своих выплат.
 *
 * ⚠️ Безопасность (2026-05-18): убраны POST/PATCH. Раньше отправщик мог
 * через своё приложение (а) записать СЕБЕ выплату на любую сумму
 * (`POST` → insert в shipper_payouts с shipper_id = свой), (б) менять
 * глобальные ставки `pendulum_rate_*` (`PATCH` → settings). Это операции
 * ТОЛЬКО владельца (§9.7). Создание выплат/смена ставок — на стороне
 * владельца (owner-API), не из shipper-приложения.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getShipperSession(request);
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

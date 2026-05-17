import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

// GET /api/referrals — список рефералов текущего пользователя
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("referral_bonuses")
      .select(
        `
        id,
        first_order_bonus,
        first_order_bonus_paid,
        referral_orders_count,
        referral_orders_sum,
        percent_bonus,
        percent_bonus_cap,
        bonus_period_ends_at,
        is_active,
        created_at,
        referral:users!referral_id(name, telegram_username)
      `
      )
      .eq("referrer_id", session.userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Referrals API error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({ referrals: data ?? [] });
  } catch (error) {
    console.error("Referrals API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

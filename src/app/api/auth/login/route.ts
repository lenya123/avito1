import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  OPERATOR_USER_ID,
  verifyOperatorCredentials,
  operatorUserRow,
} from "@/lib/constants/operator";

/**
 * Standalone-логин: один оператор, логин/пароль из .env.
 * При успехе гарантируем наличие строки оператора в `users` (idempotent upsert),
 * чтобы все Avito-сессии/FK/RLS работали без ручного сидирования БД.
 *
 * // STUB: owner-panel — заменить на аутентификацию панели владельца.
 */
const loginSchema = z.object({
  login: z.string().min(1, "Введите логин").max(128),
  password: z.string().min(1, "Введите пароль").max(256),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Введите логин и пароль", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { login, password } = result.data;

    if (!verifyOperatorCredentials(login, password)) {
      return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Idempotent: создаём/обновляем единственную строку оператора.
    const { error: upsertError } = await supabase
      .from("users")
      .upsert(operatorUserRow(), { onConflict: "id" });

    if (upsertError) {
      console.error("Operator upsert error:", upsertError);
      return NextResponse.json(
        { error: "Не удалось инициализировать оператора. Проверьте подключение к БД." },
        { status: 500 }
      );
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", OPERATOR_USER_ID)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "Оператор не найден после инициализации" }, { status: 500 });
    }

    const sessionData = {
      userId: user.id,
      role: user.role, // 'client' — привилегированный (см. lib/constants/operator.ts)
      name: user.name,
      isVibePlus: user.is_vibe_plus,
      subscriptionTier: user.subscription_tier,
      subscriptionEnd: user.subscription_end,
    };

    const response = NextResponse.json({
      success: true,
      user: mapOperatorUser(user),
    });

    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString("base64");
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60, // 30 дней
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOperatorUser(user: any) {
  return {
    id: user.id,
    role: user.role,
    name: user.name || "Оператор",
    avatarUrl: user.avatar_url || null,
    telegramUsername: user.telegram_username || null,
    level: user.level ?? 3,
    deposit: user.deposit ?? 0,
    referralDeposit: user.referral_deposit ?? 0,
    depositLimit: user.deposit_limit ?? 0,
    isVibePlus: !!user.is_vibe_plus,
    subscriptionTier: user.subscription_tier ?? "top_floor_boss",
    subscriptionEnd: user.subscription_end ?? null,
    scheduledSubscriptionTier: null,
    discountPercent: user.discount_percent ?? 0,
    completedOrdersCount: user.total_completed_orders ?? 0,
    referralCode: user.referral_code ?? null,
    referralCount: 0,
    referralEarned: 0,
    isOnboardingCompleted: true,
    firstOrderDiscountUsed: !!user.first_order_discount_used,
    notificationSettings: {
      orderStatus: user.notification_order_status ?? true,
      newProducts: user.notification_new_products ?? true,
      promotions: user.notification_promotions ?? true,
    },
    hasAvitoCredentials: !!(user.avito_client_id && user.avito_client_secret),
    avitoAccountLimit: user.avito_account_limit ?? 0,
  };
}

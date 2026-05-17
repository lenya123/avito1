import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { User } from "@/types/database";

const loginSchema = z.object({
  siteKey: z
    .string()
    .length(64, "Ключ должен содержать 64 символа")
    .regex(/^[a-f0-9]+$/i, "Ключ должен содержать только hex символы"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Валидация
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Неверный формат ключа", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { siteKey } = result.data;

    // Используем service client для обхода RLS
    const supabase = createServiceClient();

    // Ищем пользователя по site_key
    const { data, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("site_key", siteKey)
      .eq("role", "client")
      .single();

    if (userError || !data) {
      return NextResponse.json({ error: "Неверный ключ доступа" }, { status: 401 });
    }

    const user = data as User;

    // Проверяем блокировку
    if (user.is_blocked) {
      return NextResponse.json(
        { error: "Аккаунт заблокирован", reason: user.blocked_reason },
        { status: 403 }
      );
    }

    // +ВАЙБ клиенты автоматически получают уровень 3 и скидку 10%
    const effectiveLevel = user.is_vibe_plus ? 3 : user.level;
    const effectiveDiscount = user.is_vibe_plus ? 10 : user.discount_percent;

    // Загружаем реферальные данные
    const { data: referralBonuses } = await supabase
      .from("referral_bonuses")
      .select("first_order_bonus, first_order_bonus_paid, percent_bonus")
      .eq("referrer_id", user.id);

    const referralCount = referralBonuses?.length ?? 0;
    const referralEarned = (referralBonuses ?? []).reduce((sum, r) => {
      return (
        sum + (r.first_order_bonus_paid ? r.first_order_bonus || 500 : 0) + (r.percent_bonus || 0)
      );
    }, 0);

    // Создаём кастомный JWT токен для пользователя
    // Supabase Auth не поддерживает авторизацию по кастомному полю,
    // поэтому используем свою систему с cookies
    const sessionData = {
      userId: user.id,
      role: user.role,
      telegramId: user.telegram_id,
      name: user.name,
      level: effectiveLevel,
      isVibePlus: user.is_vibe_plus,
      subscriptionTier: user.subscription_tier,
      subscriptionEnd: user.subscription_end,
      scheduledSubscriptionTier: user.scheduled_subscription_tier,
    };

    // Создаём response с cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        avatarUrl: user.avatar_url || null,
        telegramUsername: user.telegram_username,
        level: effectiveLevel,
        deposit: user.deposit,
        referralDeposit: user.referral_deposit,
        depositLimit: user.deposit_limit,
        isVibePlus: user.is_vibe_plus,
        subscriptionTier: user.subscription_tier,
        subscriptionEnd: user.subscription_end,
        scheduledSubscriptionTier: user.scheduled_subscription_tier,
        discountPercent: effectiveDiscount,
        completedOrdersCount: user.total_completed_orders,
        referralCode: user.referral_code,
        referralCount,
        referralEarned,
        isOnboardingCompleted: user.is_onboarding_completed,
        firstOrderDiscountUsed: user.first_order_discount_used,
        notificationSettings: {
          orderStatus: user.notification_order_status,
          newProducts: user.notification_new_products,
          promotions: user.notification_promotions,
        },
        // Avito API (только флаг, секреты не передаём)
        hasAvitoCredentials: !!(user.avito_client_id && user.avito_client_secret),
      },
    });

    // Устанавливаем cookie с сессией (30 дней)
    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString("base64");

    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60, // 30 дней
      path: "/",
    });

    // Логируем вход (не блокируем ответ)
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip");
    supabase
      .from("activity_log")
      .insert({
        user_id: user.id,
        action: "login",
        details: {
          method: "site_key",
          ip: ipAddress,
        },
        ip_address: ipAddress as unknown,
        user_agent: request.headers.get("user-agent"),
      })
      .then(() => {});

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

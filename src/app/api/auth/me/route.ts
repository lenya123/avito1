import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { SUBSCRIPTION_PLANS, type SubscriptionTier } from "@/lib/constants/subscriptions";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session");

    if (!sessionCookie?.value) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    // Декодируем сессию
    let sessionData;
    try {
      sessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    } catch {
      return NextResponse.json({ error: "Невалидная сессия" }, { status: 401 });
    }

    const { userId } = sessionData;

    if (!userId) {
      return NextResponse.json({ error: "Невалидная сессия" }, { status: 401 });
    }

    // Получаем актуальные данные пользователя
    const supabase = createServiceClient();

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !user) {
      // Удаляем невалидную сессию
      const response = NextResponse.json({ error: "Пользователь не найден" }, { status: 401 });
      response.cookies.set("session", "", { maxAge: 0, path: "/" });
      return response;
    }

    if (user.is_blocked) {
      const response = NextResponse.json(
        { error: "Аккаунт заблокирован", reason: user.blocked_reason },
        { status: 403 }
      );
      response.cookies.set("session", "", { maxAge: 0, path: "/" });
      return response;
    }

    // Автоактивация запланированного тарифа при истечении текущей подписки
    if (
      user.scheduled_subscription_tier &&
      user.subscription_end &&
      new Date(user.subscription_end) <= new Date()
    ) {
      const now = new Date();
      const newEnd = new Date(now);
      newEnd.setDate(newEnd.getDate() + 30);

      const { error: activateError } = await supabase
        .from("users")
        .update({
          subscription_tier: user.scheduled_subscription_tier,
          subscription_start: now.toISOString().split("T")[0],
          subscription_end: newEnd.toISOString().split("T")[0],
          scheduled_subscription_tier: null,
        })
        .eq("id", userId);

      if (!activateError) {
        user.subscription_tier = user.scheduled_subscription_tier;
        user.subscription_start = now.toISOString().split("T")[0];
        user.subscription_end = newEnd.toISOString().split("T")[0];
        user.scheduled_subscription_tier = null;
      }
    }

    // Автопродление истёкшей подписки с депозита
    if (
      user.subscription_tier &&
      user.subscription_tier !== "none" &&
      user.subscription_end &&
      new Date(user.subscription_end) <= new Date() &&
      !user.scheduled_subscription_tier // scheduled уже обработан выше
    ) {
      const plan = SUBSCRIPTION_PLANS[user.subscription_tier as SubscriptionTier];
      const price = user.is_vibe_plus && plan.priceVibe !== null ? plan.priceVibe : plan.price;

      const totalBalance = (user.deposit || 0) + (user.referral_deposit || 0);

      if (totalBalance >= price) {
        // Списываем: сначала referral_deposit, потом deposit
        let remaining = price;
        let newReferralDeposit = user.referral_deposit || 0;
        let newDeposit = user.deposit || 0;

        const referralDeduction = Math.min(remaining, newReferralDeposit);
        newReferralDeposit -= referralDeduction;
        remaining -= referralDeduction;

        newDeposit -= remaining;

        const now = new Date();
        const newEnd = new Date(now);
        newEnd.setDate(newEnd.getDate() + 30);

        const { error: renewError } = await supabase
          .from("users")
          .update({
            subscription_start: now.toISOString().split("T")[0],
            subscription_end: newEnd.toISOString().split("T")[0],
            deposit: newDeposit,
            referral_deposit: newReferralDeposit,
          })
          .eq("id", userId);

        if (!renewError) {
          user.subscription_start = now.toISOString().split("T")[0];
          user.subscription_end = newEnd.toISOString().split("T")[0];
          user.deposit = newDeposit;
          user.referral_deposit = newReferralDeposit;
        }
      }
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

    const response = NextResponse.json({
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
        // Настройки уведомлений
        notificationSettings: {
          orderStatus: user.notification_order_status,
          newProducts: user.notification_new_products,
          promotions: user.notification_promotions,
        },
        // Avito API (только флаг, секреты не передаём)
        hasAvitoCredentials: !!(user.avito_client_id && user.avito_client_secret),
        avitoAccountLimit: user.avito_account_limit ?? 0,
      },
    });

    // Обновляем session cookie актуальными данными из БД
    // (middleware читает подписку из cookie, поэтому cookie должна быть в синхронизации с БД)
    const updatedSession = {
      ...sessionData,
      subscriptionTier: user.subscription_tier,
      subscriptionEnd: user.subscription_end,
      isVibePlus: user.is_vibe_plus,
      scheduledSubscriptionTier: user.scheduled_subscription_tier,
      avitoAccountLimit: user.avito_account_limit ?? 0,
    };
    const sessionToken = Buffer.from(JSON.stringify(updatedSession)).toString("base64");
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

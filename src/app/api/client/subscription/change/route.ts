import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  SUBSCRIPTION_PLANS,
  getTfbPrice,
  type SubscriptionTier,
} from "@/lib/constants/subscriptions";

// Порядок тарифов для определения upgrade/downgrade
const TIER_ORDER: SubscriptionTier[] = ["none", "basic", "premium", "top_floor_boss"];

// Схема валидации
const changeSubscriptionSchema = z
  .object({
    tier: z.enum(["basic", "premium", "top_floor_boss"]),
    avitoAccountLimit: z.number().int().min(1).max(3).optional(),
  })
  .refine((data) => data.tier !== "top_floor_boss" || data.avitoAccountLimit !== undefined, {
    message: "avitoAccountLimit обязателен для Top Floor Boss",
    path: ["avitoAccountLimit"],
  });

/**
 * POST /api/client/subscription/change
 * Изменить тариф подписки
 *
 * Логика:
 * - Upgrade: активация сразу, новый период 30 дней
 * - Downgrade: запланировать на конец текущего периода
 *
 * Примечание: Реальная оплата через ЮKassa будет добавлена позже.
 * Сейчас смена происходит без оплаты (для тестирования).
 */
export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session");

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

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

    // Парсим и валидируем тело запроса
    const body = await request.json();
    const validationResult = changeSubscriptionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Невалидный тариф", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tier: newTier, avitoAccountLimit } = validationResult.data;

    const supabase = createServiceClient();

    // Получаем текущего пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select(
        "id, subscription_tier, subscription_end, is_vibe_plus, scheduled_subscription_tier, avito_account_limit"
      )
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const currentTier = (user.subscription_tier || "none") as SubscriptionTier;
    const isExpired = !user.subscription_end || new Date(user.subscription_end) <= new Date();

    // Within-TFB variant change: тот же tier, но другое кол-во аккаунтов
    if (
      currentTier === newTier &&
      newTier === "top_floor_boss" &&
      !isExpired &&
      avitoAccountLimit
    ) {
      if (user.avito_account_limit === avitoAccountLimit) {
        return NextResponse.json({ error: "У вас уже этот вариант подписки" }, { status: 400 });
      }

      // Просто обновляем лимит без изменения дат подписки
      const { error: limitError } = await supabase
        .from("users")
        .update({ avito_account_limit: avitoAccountLimit })
        .eq("id", userId);

      if (limitError) {
        return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
      }

      const updatedSession = {
        ...sessionData,
        avitoAccountLimit,
      };
      const response = NextResponse.json({
        success: true,
        message: `Количество Avito аккаунтов изменено на ${avitoAccountLimit}`,
        subscription: { tier: newTier, avitoAccountLimit },
      });
      const sessionToken = Buffer.from(JSON.stringify(updatedSession)).toString("base64");
      response.cookies.set("session", sessionToken, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      });
      return response;
    }

    // Нельзя выбрать тот же тариф (если подписка ещё активна)
    if (currentTier === newTier && !isExpired) {
      return NextResponse.json({ error: "Вы уже на этом тарифе" }, { status: 400 });
    }

    // Нельзя запланировать тот же тариф, который уже запланирован
    if (user.scheduled_subscription_tier === newTier) {
      return NextResponse.json({ error: "Этот тариф уже запланирован" }, { status: 400 });
    }

    // Определяем upgrade или downgrade
    const currentIndex = TIER_ORDER.indexOf(currentTier);
    const newIndex = TIER_ORDER.indexOf(newTier);
    const isUpgrade = newIndex > currentIndex;

    // Получаем информацию о новом тарифе
    const newPlan = SUBSCRIPTION_PLANS[newTier];

    // Рассчитываем цену (для TFB — по вариации, для остальных — стандартно)
    const price =
      newTier === "top_floor_boss" && avitoAccountLimit
        ? getTfbPrice(avitoAccountLimit, !!user.is_vibe_plus)
        : user.is_vibe_plus && newPlan.priceVibe !== null
          ? newPlan.priceVibe
          : newPlan.price;

    // Новая дата окончания подписки
    const now = new Date();
    let newSubscriptionEnd: Date;

    if (isUpgrade) {
      // Upgrade: активация сразу, +30 дней от сегодня
      newSubscriptionEnd = new Date(now);
      newSubscriptionEnd.setDate(newSubscriptionEnd.getDate() + 30);
    } else {
      // Downgrade: если есть активная подписка — запланировать смену
      if (user.subscription_end && new Date(user.subscription_end) > now) {
        // Сохраняем запланированный тариф в БД
        const { error: scheduleError } = await supabase
          .from("users")
          .update({ scheduled_subscription_tier: newTier })
          .eq("id", userId);

        if (scheduleError) {
          console.error("Schedule subscription error:", scheduleError);
          return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
        }

        // Обновляем cookie с запланированным тарифом
        const updatedSession = {
          ...sessionData,
          scheduledSubscriptionTier: newTier,
        };

        const response = NextResponse.json({
          success: true,
          message: `Тариф ${newPlan.name} активируется после окончания текущей подписки`,
          subscription: {
            currentTier: currentTier,
            scheduledTier: newTier,
            scheduledDate: user.subscription_end,
            price: price,
          },
        });

        const sessionToken = Buffer.from(JSON.stringify(updatedSession)).toString("base64");
        response.cookies.set("session", sessionToken, {
          httpOnly: true,
          secure: process.env.COOKIE_SECURE === "true",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60,
          path: "/",
        });

        return response;
      } else {
        // Если подписка уже истекла — активируем сразу
        newSubscriptionEnd = new Date(now);
        newSubscriptionEnd.setDate(newSubscriptionEnd.getDate() + 30);
      }
    }

    // Обновляем подписку пользователя (+ очищаем запланированный тариф если был)
    const updateData: Record<string, unknown> = {
      subscription_tier: newTier,
      subscription_start: now.toISOString().split("T")[0],
      subscription_end: newSubscriptionEnd.toISOString().split("T")[0],
      scheduled_subscription_tier: null,
    };

    // Для TFB — устанавливаем лимит аккаунтов
    if (newTier === "top_floor_boss" && avitoAccountLimit) {
      updateData.avito_account_limit = avitoAccountLimit;
    } else if (newTier !== "top_floor_boss") {
      // При переходе с TFB на другой тариф — сбрасываем лимит
      updateData.avito_account_limit = 0;
    }

    const { error: updateError } = await supabase.from("users").update(updateData).eq("id", userId);

    if (updateError) {
      console.error("Update subscription error:", updateError);
      return NextResponse.json({ error: "Ошибка обновления подписки" }, { status: 500 });
    }

    // Обновляем session cookie с новым тарифом (для middleware paywall)
    const updatedSession = {
      ...sessionData,
      subscriptionTier: newTier,
      subscriptionEnd: newSubscriptionEnd.toISOString().split("T")[0],
      scheduledSubscriptionTier: null,
      avitoAccountLimit: newTier === "top_floor_boss" ? (avitoAccountLimit ?? 1) : 0,
    };

    const response = NextResponse.json({
      success: true,
      message: isUpgrade
        ? `Подписка ${newPlan.name} активирована!`
        : `Подписка изменена на ${newPlan.name}`,
      subscription: {
        tier: newTier,
        name: newPlan.name,
        subscriptionEnd: newSubscriptionEnd.toISOString().split("T")[0],
        price: price,
        isUpgrade: isUpgrade,
      },
    });

    const sessionToken = Buffer.from(JSON.stringify(updatedSession)).toString("base64");
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Change subscription error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

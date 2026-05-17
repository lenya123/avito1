import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

// Схема валидации
const updateNotificationsSchema = z.object({
  orderStatus: z.boolean().optional(),
  newProducts: z.boolean().optional(),
  promotions: z.boolean().optional(),
});

/**
 * GET /api/client/notifications
 * Получить настройки уведомлений текущего пользователя
 */
export async function GET(request: NextRequest) {
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

    const supabase = createServiceClient();

    const { data: user, error } = await supabase
      .from("users")
      .select("notification_order_status, notification_new_products, notification_promotions")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json({
      settings: {
        orderStatus: user.notification_order_status,
        newProducts: user.notification_new_products,
        promotions: user.notification_promotions,
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/**
 * PATCH /api/client/notifications
 * Обновить настройки уведомлений
 */
export async function PATCH(request: NextRequest) {
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
    const validationResult = updateNotificationsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Невалидные данные", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { orderStatus, newProducts, promotions } = validationResult.data;

    // Формируем объект обновления
    const updateData: Record<string, boolean> = {};
    if (orderStatus !== undefined) updateData.notification_order_status = orderStatus;
    if (newProducts !== undefined) updateData.notification_new_products = newProducts;
    if (promotions !== undefined) updateData.notification_promotions = promotions;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: user, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId)
      .select("notification_order_status, notification_new_products, notification_promotions")
      .single();

    if (error) {
      console.error("Update notifications error:", error);
      return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
    }

    return NextResponse.json({
      settings: {
        orderStatus: user.notification_order_status,
        newProducts: user.notification_new_products,
        promotions: user.notification_promotions,
      },
    });
  } catch (error) {
    console.error("Update notifications error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

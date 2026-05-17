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

    const supabase = createServiceClient();

    // Ищем отправщика по site_key
    const { data, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("site_key", siteKey)
      .eq("role", "shipper")
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

    // Создаём сессию (8 часов для отправщика — рабочий день)
    const sessionData = {
      userId: user.id,
      role: user.role,
      telegramId: user.telegram_id,
      name: user.name,
    };

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        telegramUsername: user.telegram_username,
      },
    });

    // Cookie на 8 часов
    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString("base64");

    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60, // 8 часов
      path: "/",
    });

    // Логируем вход
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
    console.error("Shipper login error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

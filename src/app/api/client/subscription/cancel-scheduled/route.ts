import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/client/subscription/cancel-scheduled
 * Отменяет запланированную смену тарифа (даунгрейд)
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

    const supabase = createServiceClient();

    // Очищаем запланированный тариф
    const { error: updateError } = await supabase
      .from("users")
      .update({ scheduled_subscription_tier: null })
      .eq("id", userId);

    if (updateError) {
      console.error("Cancel scheduled subscription error:", updateError);
      return NextResponse.json({ error: "Ошибка отмены" }, { status: 500 });
    }

    // Обновляем cookie
    const updatedSession = {
      ...sessionData,
      scheduledSubscriptionTier: null,
    };

    const response = NextResponse.json({
      success: true,
      message: "Запланированная смена тарифа отменена",
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
    console.error("Cancel scheduled subscription error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/**
 * API Route: POST /api/client/support/chat
 * AI-помощник для страницы поддержки
 *
 * Требования:
 * - Только для premium+ пользователей
 * - Rate limiting: 10/мин, 100/день
 * - Streaming ответ
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildUserContext,
  generateStreamingResponse,
  type UserContext,
  type OrderContext,
  type ChatMessage,
} from "@/lib/ai/support-agent";

// Rate limiting в памяти (в проде — Redis)
const rateLimits = new Map<
  string,
  { minute: number; day: number; minuteReset: number; dayReset: number }
>();

function checkRateLimit(userId: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const limit = rateLimits.get(userId);

  if (!limit) {
    rateLimits.set(userId, {
      minute: 1,
      day: 1,
      minuteReset: now + 60000,
      dayReset: now + 86400000,
    });
    return { allowed: true };
  }

  // Сброс лимитов
  if (now > limit.minuteReset) {
    limit.minute = 0;
    limit.minuteReset = now + 60000;
  }
  if (now > limit.dayReset) {
    limit.day = 0;
    limit.dayReset = now + 86400000;
  }

  // Проверка лимитов
  if (limit.minute >= 10) {
    return { allowed: false, error: "Слишком много сообщений. Подожди минуту." };
  }
  if (limit.day >= 100) {
    return {
      allowed: false,
      error: "Дневной лимит исчерпан. Попробуй завтра.",
    };
  }

  limit.minute++;
  limit.day++;
  return { allowed: true };
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Получаем данные запроса
    const body = await request.json();
    const { message, history = [] } = body as {
      message: string;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Сообщение обязательно" }, { status: 400 });
    }

    // 2. Аутентификация через session cookie
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Декодируем сессию
    let sessionData: { userId?: string };
    try {
      sessionData = JSON.parse(Buffer.from(sessionCookie, "base64").toString());
    } catch {
      return NextResponse.json({ error: "Невалидная сессия" }, { status: 401 });
    }

    if (!sessionData.userId) {
      return NextResponse.json({ error: "Невалидная сессия" }, { status: 401 });
    }

    const supabase = getServiceClient();

    // 3. Получаем пользователя по ID из сессии
    const { data: user, error: userError } = await supabase
      .from("users")
      .select(
        `
        id,
        name,
        telegram_username,
        level,
        discount_percent,
        deposit,
        referral_deposit,
        subscription_tier,
        is_vibe_plus,
        total_completed_orders
      `
      )
      .eq("id", sessionData.userId)
      .eq("role", "client")
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 401 });
    }

    // 4. Проверяем подписку (только premium+)
    const isPremium =
      user.is_vibe_plus ||
      user.subscription_tier === "premium" ||
      user.subscription_tier === "top_floor_boss";

    if (!isPremium) {
      return NextResponse.json(
        { error: "AI-помощник доступен только с Premium подпиской" },
        { status: 403 }
      );
    }

    // 5. Rate limiting
    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.error }, { status: 429 });
    }

    // 6. Получаем заказы пользователя
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(
        `
        id,
        status,
        deadline,
        tracking_number,
        return_code,
        product:products(title),
        product_size:product_sizes(size)
      `
      )
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("[support-chat] Orders fetch error:", ordersError);
    }

    // 7. Формируем контекст
    const userContext: UserContext = {
      name: user.name || user.telegram_username || "Клиент",
      level: user.level || 0,
      discount: user.discount_percent || 0,
      deposit: user.deposit || 0,
      referralDeposit: user.referral_deposit || 0,
      subscriptionTier: user.subscription_tier || "none",
      isVibePlus: user.is_vibe_plus || false,
      completedOrders: user.total_completed_orders || 0,
    };

    const ordersContext: OrderContext[] = (orders || []).map((o) => {
      // Supabase может вернуть объект или массив для связанных таблиц
      const product = Array.isArray(o.product) ? o.product[0] : o.product;
      const productSize = Array.isArray(o.product_size) ? o.product_size[0] : o.product_size;
      return {
        id: o.id,
        productTitle: (product as { title: string })?.title || "Товар",
        size: (productSize as { size: string })?.size || "?",
        status: o.status,
        deadline: o.deadline,
        trackingNumber: o.tracking_number,
        returnCode: o.return_code,
      };
    });

    const contextString = buildUserContext(userContext, ordersContext);

    // 8. Генерируем streaming ответ
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generateStreamingResponse(message, contextString, history)) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error) {
          console.error("[support-chat] Streaming error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Ошибка генерации ответа. Попробуй позже или напиши владельцу в Telegram: @avitofammanager" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[support-chat] Error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

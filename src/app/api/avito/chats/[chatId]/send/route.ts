import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getWebSessionById } from "@/lib/avito";
import { sendAvitoWebMessage } from "@/lib/avito/web-client";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const bodySchema = z.object({
  text: z.string().min(1).max(1000),
});

// POST — отправить сообщение в чат (через web proxy)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { chatId } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Текст сообщения обязателен (макс. 1000 символов)" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Находим чат (проверяем владельца + получаем session_id)
    const { data: chat } = await supabase
      .from("avito_chats")
      .select("avito_chat_id, session_id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (!chat.session_id) {
      return NextResponse.json({ error: "Браузерная сессия недоступна" }, { status: 500 });
    }

    const webSession = await getWebSessionById(chat.session_id);
    if (!webSession) {
      return NextResponse.json(
        { error: "Нет активной браузерной сессии. Переподключите аккаунт." },
        { status: 400 }
      );
    }

    const result = await sendAvitoWebMessage(webSession, chat.avito_chat_id, parsed.data.text);

    if (!result.success) {
      return NextResponse.json(
        { error: "Не удалось отправить сообщение через Avito" },
        { status: 502 }
      );
    }

    // Сохраняем в кеш
    const now = new Date().toISOString();
    const messageId = result.messageId ?? crypto.randomUUID();
    await supabase.from("avito_messages").insert({
      chat_id: chatId,
      user_id: userId,
      avito_message_id: messageId,
      direction: "out",
      content_text: parsed.data.text,
      message_type: "text",
      avito_created_at: now,
    });

    await supabase
      .from("avito_chats")
      .update({
        last_message: parsed.data.text,
        last_message_at: now,
        last_message_direction: "out",
        updated_at: now,
      })
      .eq("id", chatId);

    return NextResponse.json({
      success: true,
      message: {
        id: result.messageId,
        direction: "out",
        content_text: parsed.data.text,
        avito_created_at: now,
      },
    });
  } catch (error) {
    console.error("Avito send message error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getWebSessionById } from "@/lib/avito";
import { fetchAvitoChatMessages } from "@/lib/avito/web-client";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

// GET — сообщения конкретного чата (через web proxy)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { chatId } = await params;

    const supabase = createServiceClient();

    // Находим чат (проверяем владельца + получаем session_id)
    const { data: chat } = await supabase
      .from("avito_chats")
      .select("*, session_id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    // Проверяем есть ли уже сообщения в кеше
    const { data: cachedMessages, count } = await supabase
      .from("avito_messages")
      .select("*", { count: "exact" })
      .eq("chat_id", chatId)
      .order("avito_created_at", { ascending: true });

    // Если в кеше пусто — подтягиваем через web proxy
    if (!count || count === 0) {
      const webSession = chat.session_id
        ? await getWebSessionById(chat.session_id)
        : null;

      if (webSession) {
        try {
          const messages = await fetchAvitoChatMessages(webSession, chat.avito_chat_id);

          if (messages.length > 0) {
            const messagesToInsert = messages.map((msg) => ({
              chat_id: chatId,
              user_id: userId,
              avito_message_id: msg.id,
              direction: msg.direction,
              content_text: msg.text,
              content_image_url: msg.imageUrl,
              message_type: msg.type,
              author_id: msg.authorId,
              avito_created_at: new Date(msg.created * 1000).toISOString(),
            }));

            await supabase.from("avito_messages").upsert(messagesToInsert, {
              onConflict: "chat_id,avito_message_id",
              ignoreDuplicates: true,
            });

            const { data: freshMessages } = await supabase
              .from("avito_messages")
              .select("*")
              .eq("chat_id", chatId)
              .order("avito_created_at", { ascending: true });

            return NextResponse.json({ chat, messages: freshMessages || [] });
          }
        } catch (err) {
          console.error("[avito/chat] Web fetch messages error:", err);
        }
      }
    }

    return NextResponse.json({ chat, messages: cachedMessages || [] });
  } catch (error) {
    console.error("Avito chat messages error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

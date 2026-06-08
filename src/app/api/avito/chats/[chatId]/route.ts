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
    const userId = await getUserIdFromSession(request);
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

    // ВСЕГДА подтягиваем свежие сообщения из Avito (чат пополняется, а кеш сам
    // не обновляется — раньше тянули лишь при пустом кеше, из-за чего новые и
    // ассистент-сообщения в диалоге не появлялись). Upsert БЕЗ ignoreDuplicates —
    // обновляет существующие строки, корректируя устаревший текст.
    const webSession = chat.session_id ? await getWebSessionById(chat.session_id) : null;
    if (webSession) {
      try {
        // owner numeric id (avito_user_id) — для direction ("out" если от нас)
        const { data: sessRow } = await supabase
          .from("avito_browser_sessions")
          .select("avito_user_id")
          .eq("id", chat.session_id as string)
          .maybeSingle();
        const ownerId =
          (sessRow as { avito_user_id?: number | null } | null)?.avito_user_id ?? undefined;
        const messages = await fetchAvitoChatMessages(
          webSession,
          chat.avito_chat_id,
          50,
          ownerId
        );

        if (messages.length > 0) {
          const rows = messages.map((msg) => ({
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
          // Реконсиляция окна: удаляем из кеша сообщения в диапазоне свежего
          // набора, которых уже НЕТ в Avito (удалённые/отклонённые модерацией —
          // напр. свой отправленный и заблокированный). История старше окна цела.
          const oldest = messages.reduce((m, x) => Math.min(m, x.created), Infinity);
          if (Number.isFinite(oldest)) {
            await supabase
              .from("avito_messages")
              .delete()
              .eq("chat_id", chatId)
              .gte("avito_created_at", new Date(oldest * 1000).toISOString());
          }
          await supabase
            .from("avito_messages")
            .upsert(rows, { onConflict: "chat_id,avito_message_id" });
        }
      } catch (err) {
        console.error("[avito/chat] Web fetch messages error:", err);
      }
    }

    // Возвращаем актуальный набор (кеш уже пополнен свежими).
    const { data: allMessages } = await supabase
      .from("avito_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("avito_created_at", { ascending: true });

    return NextResponse.json({ chat, messages: allMessages || [] });
  } catch (error) {
    console.error("Avito chat messages error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

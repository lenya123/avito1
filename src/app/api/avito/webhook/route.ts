import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAutomationQueue } from "@/lib/jobs/queues";

/**
 * POST /api/avito/webhook — входящие события от Avito
 *
 * БЕЗ auth check — это Avito вызывает нас.
 * КРИТИЧНО: ответить 200 за <2 секунды (Avito timeout).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Валидация минимальной структуры
    if (!body?.payload?.value) {
      return NextResponse.json({ ok: true }); // Ack даже невалидные
    }

    const { payload } = body;

    // Обрабатываем только сообщения
    if (payload.type !== "message") {
      return NextResponse.json({ ok: true });
    }

    const value = payload.value;
    const {
      id: messageId,
      chat_id: avitoChatId,
      author_id: authorId,
      user_id: avitoUserId,
      created,
      type: messageType,
      content,
      item_id: itemId,
    } = value;

    const supabase = createServiceClient();

    // Находим сессию по avito_user_id (теперь credentials в avito_browser_sessions)
    const { data: session } = await supabase
      .from("avito_browser_sessions")
      .select("id, user_id")
      .eq("avito_user_id", avitoUserId)
      .limit(1)
      .single();

    if (!session) {
      console.warn(`[Avito Webhook] Session not found for avito_user_id=${avitoUserId}`);
      return NextResponse.json({ ok: true }); // Ack чтобы Avito не ретраил
    }

    const userId = session.user_id;
    const sessionId = session.id;
    const isIncoming = authorId !== avitoUserId;
    const direction = isIncoming ? "in" : "out";
    const messageText = content?.text || null;
    const imageUrl = content?.image?.url || null;
    const createdAt = new Date(created * 1000).toISOString();

    // Upsert чат (ON CONFLICT UPDATE) — теперь с session_id
    const { data: chat } = await supabase
      .from("avito_chats")
      .upsert(
        {
          user_id: userId,
          session_id: sessionId,
          avito_chat_id: avitoChatId,
          item_id: itemId || null,
          last_message: messageText || `[${messageType}]`,
          last_message_at: createdAt,
          last_message_direction: direction,
          unread_count: isIncoming ? 1 : 0,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,avito_chat_id" }
      )
      .select("id")
      .single();

    if (!chat) {
      console.error("[Avito Webhook] Failed to upsert chat");
      return NextResponse.json({ ok: true });
    }

    // Insert сообщение (ON CONFLICT DO NOTHING — дедупликация)
    const { data: msg } = await supabase
      .from("avito_messages")
      .upsert(
        {
          chat_id: chat.id,
          user_id: userId,
          avito_message_id: messageId,
          direction,
          content_text: messageText,
          content_image_url: imageUrl,
          message_type: messageType,
          author_id: authorId,
          avito_created_at: createdAt,
        },
        { onConflict: "chat_id,avito_message_id", ignoreDuplicates: true }
      )
      .select("id")
      .single();

    // AI Sales Agent: генерация черновика для входящих текстовых сообщений
    if (isIncoming && messageText && msg) {
      try {
        const { data: salesSettings } = await supabase
          .from("ai_sales_settings")
          .select("is_enabled, work_hours_start, work_hours_end, timezone")
          .eq("user_id", userId)
          .eq("is_enabled", true)
          .single();

        if (salesSettings) {
          const now = new Date();
          const tz = salesSettings.timezone || "Europe/Moscow";
          const currentHour = parseInt(
            now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false })
          );
          const start = salesSettings.work_hours_start ?? 8;
          const end = salesSettings.work_hours_end ?? 23;

          if (currentHour >= start && currentHour < end) {
            const queue = getAutomationQueue();
            await queue.add(
              "generate-sales-draft",
              {
                userId,
                chatId: chat.id,
                messageId: msg.id,
                buyerMessage: messageText,
                avitoItemId: itemId || undefined,
              },
              { jobId: `draft-${msg.id}` }
            );
          }
        }
      } catch {
        // Не блокируем webhook при ошибке AI
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Avito Webhook] Error:", error);
    // Всегда 200 чтобы Avito не ретраил
    return NextResponse.json({ ok: true });
  }
}

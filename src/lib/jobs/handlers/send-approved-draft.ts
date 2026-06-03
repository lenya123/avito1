/**
 * BullMQ Handler: send-approved-draft
 *
 * Отправляет одобренный/автоматический черновик в Avito чат.
 * Использует web proxy (cookies + прокси) вместо OAuth API.
 */

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { sendAvitoWebMessage } from "@/lib/avito/web-client";
import type { WebBrowserSession } from "@/lib/avito/sync";

export interface SendApprovedDraftJobData {
  draftId: string;
  userId: string;
  text: string;
  avitoChatId: string; // avito_chats.avito_chat_id
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function handleSendApprovedDraft(job: Job<SendApprovedDraftJobData>): Promise<void> {
  const { draftId, userId, text, avitoChatId } = job.data;
  const supabase = getSupabase();

  console.log(
    `[send-approved-draft] Sending draft=${draftId.slice(0, 8)}... to chat=${avitoChatId.slice(0, 8)}...`
  );

  try {
    // 1. Проверить что черновик ещё актуален
    const { data: draft } = await supabase
      .from("ai_sales_drafts")
      .select("id, status")
      .eq("id", draftId)
      .single();

    if (!draft || (draft.status !== "approved" && draft.status !== "auto_sent")) {
      console.log(`[send-approved-draft] Draft ${draftId} status=${draft?.status}, skipping`);
      return;
    }

    // 2. Получить web session для пользователя
    const { data: session } = await supabase
      .from("avito_browser_sessions")
      .select("cookies, user_agent, proxy_url, browser_fingerprint")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("account_index", { ascending: true })
      .limit(1)
      .single();

    if (!session) {
      console.error("[send-approved-draft] No active browser session for user:", userId);
      throw new Error("No active browser session");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cookies = (session.cookies as any[]) ?? [];
    if (cookies.length === 0) {
      throw new Error("Browser session has no cookies");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fp = session.browser_fingerprint as any;
    const webSession: WebBrowserSession = {
      cookies,
      userAgent: session.user_agent ?? "Mozilla/5.0",
      proxyUrl: session.proxy_url ?? null,
      platform: fp?.platform ?? null,
    };

    // 3. Отправить сообщение через web proxy
    const result = await sendAvitoWebMessage(webSession, avitoChatId, text);

    if (!result.success) {
      console.error("[send-approved-draft] Web send failed");
      throw new Error("Web sendMessage failed");
    }

    console.log(`[send-approved-draft] Message sent: avito_msg_id=${result.messageId}`);

    // 4. Обновить черновик
    await supabase
      .from("ai_sales_drafts")
      .update({
        sent_at: new Date().toISOString(),
        sent_avito_message_id: result.messageId,
      })
      .eq("id", draftId);

    // 5. Обновить чат (last_message)
    const { data: chatRow } = await supabase
      .from("avito_chats")
      .select("id")
      .eq("user_id", userId)
      .eq("avito_chat_id", avitoChatId)
      .single();

    if (chatRow) {
      await supabase
        .from("avito_chats")
        .update({
          last_message: text.slice(0, 200),
          last_message_at: new Date().toISOString(),
          last_message_direction: "out",
          unread_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatRow.id);

      // 6. Сохранить сообщение в avito_messages
      if (result.messageId) {
        await supabase.from("avito_messages").upsert(
          {
            chat_id: chatRow.id,
            user_id: userId,
            avito_message_id: result.messageId,
            direction: "out",
            content_text: text,
            message_type: "text",
            avito_created_at: new Date().toISOString(),
          },
          { onConflict: "chat_id,avito_message_id", ignoreDuplicates: true }
        );
      }
    }

    console.log(`[send-approved-draft] Done: draft=${draftId.slice(0, 8)}`);
  } catch (error) {
    console.error("[send-approved-draft] Error:", error);
    throw error;
  }
}

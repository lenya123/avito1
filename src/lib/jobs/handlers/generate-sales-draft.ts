/**
 * BullMQ Handler: generate-sales-draft
 *
 * Генерирует черновик ответа покупателю через AI.
 * Вызывается из webhook при входящем сообщении.
 */

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { buildSalesContext, generateSalesDraft } from "@/lib/ai/sales-agent";
import { normalizeIncoming } from "@/lib/ai/relay";

export interface GenerateSalesDraftJobData {
  userId: string;
  chatId: string; // internal UUID (avito_chats.id)
  messageId: string; // internal UUID (avito_messages.id)
  buyerMessage: string;
  /** Медиа входящего (фото/гс) — нормализуется через AI-реле в текст */
  mediaImageUrl?: string;
  mediaVoiceUrl?: string;
  avitoItemId?: number;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function handleGenerateSalesDraft(job: Job<GenerateSalesDraftJobData>): Promise<void> {
  const { userId, chatId, messageId, mediaImageUrl, mediaVoiceUrl } = job.data;
  let buyerMessage = job.data.buyerMessage;
  const supabase = getSupabase();

  // AI-реле: входящее фото/гс → текст до нейронки (труба текст/фото/гс).
  if ((!buyerMessage || !buyerMessage.trim()) && (mediaImageUrl || mediaVoiceUrl)) {
    buyerMessage = await normalizeIncoming({
      text: buyerMessage,
      imageUrl: mediaImageUrl,
      voiceUrl: mediaVoiceUrl,
    });
    // Пишем нормализованный текст в кеш — чтобы история чата его учитывала
    await supabase
      .from("avito_messages")
      .update({ content_text: buyerMessage })
      .eq("id", messageId);
  }
  if (!buyerMessage || !buyerMessage.trim()) {
    console.log("[generate-sales-draft] empty message after relay, skipping");
    return;
  }

  console.log(`[generate-sales-draft] Generating for user=${userId} chat=${chatId.slice(0, 8)}...`);

  try {
    // 1. Проверить настройки (ещё раз, на случай отключения между webhook и обработкой)
    const { data: settings } = await supabase
      .from("ai_sales_settings")
      .select(
        "is_enabled, mode, max_drafts_per_day, confidence_threshold, min_response_delay, max_response_delay"
      )
      .eq("user_id", userId)
      .single();

    if (!settings?.is_enabled) {
      console.log("[generate-sales-draft] AI disabled for user, skipping");
      return;
    }

    // 2. Проверить лимит черновиков за день
    const today = new Date().toISOString().split("T")[0];
    const { count } = await supabase
      .from("ai_sales_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("generated_at", `${today}T00:00:00Z`);

    if ((count ?? 0) >= (settings.max_drafts_per_day ?? 200)) {
      console.log("[generate-sales-draft] Daily limit reached, skipping");
      return;
    }

    // 3. Проверить что для этого сообщения ещё нет черновика
    const { data: existing } = await supabase
      .from("ai_sales_drafts")
      .select("id")
      .eq("avito_message_id", messageId)
      .single();

    if (existing) {
      console.log("[generate-sales-draft] Draft already exists, skipping");
      return;
    }

    // 4. Построить контекст
    const context = await buildSalesContext(userId, chatId);

    // 5. Сгенерировать черновик
    const result = await generateSalesDraft(userId, context, buyerMessage);

    // 6. Получить ID активной версии промпта
    const { data: activeVersion } = await supabase
      .from("ai_sales_prompt_versions")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    // 7. Определить статус: auto_sent или pending
    let status = "pending";
    if (
      settings.mode === "auto_full" ||
      (settings.mode === "auto_simple" &&
        result.confidence >= (settings.confidence_threshold ?? 0.85))
    ) {
      status = "auto_sent";
    }

    // 8. Сохранить черновик
    const { data: draft, error: insertError } = await supabase
      .from("ai_sales_drafts")
      .insert({
        user_id: userId,
        avito_chat_id: chatId,
        avito_message_id: messageId,
        buyer_message: buyerMessage,
        chat_history: context.chatHistory,
        item_context: {
          title: context.avitoItemTitle,
          price: context.avitoItemPrice,
          url: context.avitoItemUrl,
        },
        product_context: context.product || null,
        original_draft: result.draft,
        confidence: result.confidence,
        reasoning: result.reasoning,
        prompt_version_id: activeVersion?.id || null,
        tokens_used: result.tokensUsed,
        generation_time_ms: result.generationTimeMs,
        status,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[generate-sales-draft] Insert error:", insertError);
      throw insertError;
    }

    console.log(
      `[generate-sales-draft] Draft created: id=${draft?.id} status=${status} ` +
        `confidence=${result.confidence} tokens=${result.tokensUsed} time=${result.generationTimeMs}ms`
    );

    // 9. Если auto_sent — ставим задачу на отправку с задержкой
    if (status === "auto_sent" && draft) {
      const { getAutomationQueue } = await import("@/lib/jobs/queues");
      const queue = getAutomationQueue();

      const minDelay = (settings.min_response_delay ?? 30) * 1000;
      const maxDelay = (settings.max_response_delay ?? 120) * 1000;
      const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

      const { data: chat } = await supabase
        .from("avito_chats")
        .select("avito_chat_id")
        .eq("id", chatId)
        .single();

      if (chat) {
        await queue.add(
          "send-approved-draft",
          {
            draftId: draft.id,
            userId,
            text: result.draft,
            avitoChatId: chat.avito_chat_id,
          },
          {
            delay,
            jobId: `send-draft-${draft.id}`,
            attempts: 2,
            backoff: { type: "fixed", delay: 5000 },
          }
        );
        console.log(`[generate-sales-draft] Auto-send scheduled in ${Math.round(delay / 1000)}s`);
      }
    }

    // 10. Уведомление владельцу (если pending и notify_on_draft)
    // TODO: Telegram уведомление (Фаза 3)
  } catch (error) {
    console.error("[generate-sales-draft] Error:", error);
    throw error; // BullMQ сделает retry
  }
}

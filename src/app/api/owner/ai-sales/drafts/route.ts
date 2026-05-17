/**
 * GET /api/owner/ai-sales/drafts — список черновиков AI-продажника
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(["all", "pending", "approved", "rejected", "expired", "auto_sent"]).default("all"),
  chatId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      chatId: searchParams.get("chatId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });

    const supabase = createServiceClient();

    let query = supabase
      .from("ai_sales_drafts")
      .select(
        `
        id,
        buyer_message,
        original_draft,
        edited_draft,
        confidence,
        reasoning,
        status,
        generated_at,
        reviewed_at,
        sent_at,
        tokens_used,
        generation_time_ms,
        item_context,
        avito_chat_id,
        avito_chats!inner(avito_chat_id, item_id)
      `,
        { count: "exact" }
      )
      .eq("user_id", session.userId)
      .order("generated_at", { ascending: false });

    // Фильтры
    if (params.status !== "all") {
      query = query.eq("status", params.status);
    }

    if (params.chatId) {
      query = query.eq("avito_chat_id", params.chatId);
    }

    if (params.dateFrom) {
      query = query.gte("generated_at", params.dateFrom);
    }

    if (params.dateTo) {
      query = query.lte("generated_at", params.dateTo);
    }

    // Пагинация
    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;
    query = query.range(from, to);

    const { data: drafts, error, count } = await query;

    if (error) {
      console.error("[AI Sales] Drafts fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки черновиков" }, { status: 500 });
    }

    // Трансформация в camelCase
    const result = drafts?.map((d) => ({
      id: d.id,
      buyerMessage: d.buyer_message,
      originalDraft: d.original_draft,
      editedDraft: d.edited_draft,
      confidence: d.confidence,
      reasoning: d.reasoning,
      status: d.status,
      generatedAt: d.generated_at,
      reviewedAt: d.reviewed_at,
      sentAt: d.sent_at,
      tokensUsed: d.tokens_used,
      generationTimeMs: d.generation_time_ms,
      itemContext: d.item_context,
      avitoChatId: d.avito_chat_id,
      chat: d.avito_chats,
    }));

    return NextResponse.json({
      drafts: result,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / params.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные параметры", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("[AI Sales] Drafts API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

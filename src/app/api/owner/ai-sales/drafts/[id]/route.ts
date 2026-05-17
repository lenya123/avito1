/**
 * PUT /api/owner/ai-sales/drafts/[id] — одобрить/отклонить/отредактировать черновик
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { scheduleSendApprovedDraft } from "@/lib/jobs/queues";

const updateDraftSchema = z.object({
  action: z.enum(["approve", "edit", "reject"]),
  editedText: z.string().min(1).optional(),
  correctionType: z
    .enum(["tone", "factual", "pricing", "sizing", "urgency", "other"])
    .optional()
    .default("other"),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateDraftSchema.parse(body);

    const supabase = createServiceClient();

    // Получить черновик
    const { data: draft, error: draftError } = await supabase
      .from("ai_sales_drafts")
      .select("id, user_id, status, original_draft, avito_chat_id")
      .eq("id", id)
      .eq("user_id", session.userId)
      .single();

    if (draftError || !draft) {
      return NextResponse.json({ error: "Черновик не найден" }, { status: 404 });
    }

    if (draft.status !== "pending") {
      return NextResponse.json({ error: "Черновик уже обработан" }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (data.action === "reject") {
      await supabase
        .from("ai_sales_drafts")
        .update({ status: "rejected", reviewed_at: now })
        .eq("id", id);

      return NextResponse.json({ success: true, status: "rejected" });
    }

    // approve или edit
    const textToSend =
      data.action === "edit" && data.editedText ? data.editedText : draft.original_draft;

    // Обновляем черновик
    await supabase
      .from("ai_sales_drafts")
      .update({
        status: "approved",
        reviewed_at: now,
        edited_draft: data.action === "edit" ? data.editedText : null,
      })
      .eq("id", id);

    // При редактировании — сохраняем правку для обучения
    if (data.action === "edit" && data.editedText) {
      await supabase.from("ai_sales_corrections").insert({
        user_id: session.userId,
        draft_id: id,
        original_text: draft.original_draft,
        corrected_text: data.editedText,
        correction_type: data.correctionType || "other",
      });
    }

    // Получаем настройки задержки
    const { data: settings } = await supabase
      .from("ai_sales_settings")
      .select("min_response_delay, max_response_delay")
      .eq("user_id", session.userId)
      .single();

    const minDelay = settings?.min_response_delay ?? 30;
    const maxDelay = settings?.max_response_delay ?? 120;
    const delaySec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    // Планируем отправку с задержкой
    await scheduleSendApprovedDraft(id, session.userId, textToSend, draft.avito_chat_id, delaySec);

    return NextResponse.json({
      success: true,
      status: "approved",
      sendIn: delaySec,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("[AI Sales] Draft update error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

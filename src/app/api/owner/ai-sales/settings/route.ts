/**
 * GET/PUT /api/owner/ai-sales/settings — настройки AI-продажника
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";

const updateSettingsSchema = z.object({
  mode: z.enum(["draft", "auto_simple", "auto_full"]).optional(),
  isEnabled: z.boolean().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  workHoursStart: z.number().min(0).max(23).optional(),
  workHoursEnd: z.number().min(0).max(23).optional(),
  minResponseDelay: z.number().min(0).max(600).optional(),
  maxResponseDelay: z.number().min(0).max(600).optional(),
  maxDraftsPerDay: z.number().min(1).max(1000).optional(),
  maxAutoSendsPerDay: z.number().min(1).max(1000).optional(),
  notifyOnDraft: z.boolean().optional(),
  notifyOnLowConfidence: z.boolean().optional(),
  notifyDailySummary: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: settings } = await supabase
      .from("ai_sales_settings")
      .select("*")
      .eq("user_id", session.userId)
      .single();

    if (!settings) {
      // Возвращаем дефолтные настройки
      return NextResponse.json({
        settings: {
          mode: "draft",
          isEnabled: false,
          confidenceThreshold: 0.85,
          workHoursStart: 8,
          workHoursEnd: 23,
          timezone: "Europe/Moscow",
          minResponseDelay: 30,
          maxResponseDelay: 120,
          maxDraftsPerDay: 200,
          maxAutoSendsPerDay: 100,
          notifyOnDraft: true,
          notifyOnLowConfidence: true,
          notifyDailySummary: true,
        },
      });
    }

    return NextResponse.json({
      settings: {
        mode: settings.mode,
        isEnabled: settings.is_enabled,
        confidenceThreshold: settings.confidence_threshold,
        workHoursStart: settings.work_hours_start,
        workHoursEnd: settings.work_hours_end,
        timezone: settings.timezone,
        minResponseDelay: settings.min_response_delay,
        maxResponseDelay: settings.max_response_delay,
        maxDraftsPerDay: settings.max_drafts_per_day,
        maxAutoSendsPerDay: settings.max_auto_sends_per_day,
        notifyOnDraft: settings.notify_on_draft,
        notifyOnLowConfidence: settings.notify_on_low_confidence,
        notifyDailySummary: settings.notify_daily_summary,
      },
    });
  } catch (error) {
    console.error("[AI Sales] Settings GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = updateSettingsSchema.parse(body);

    const supabase = createServiceClient();

    // Строим объект обновления (только переданные поля)
    const updateData: Record<string, unknown> = {};
    if (data.mode !== undefined) updateData.mode = data.mode;
    if (data.isEnabled !== undefined) updateData.is_enabled = data.isEnabled;
    if (data.confidenceThreshold !== undefined)
      updateData.confidence_threshold = data.confidenceThreshold;
    if (data.workHoursStart !== undefined) updateData.work_hours_start = data.workHoursStart;
    if (data.workHoursEnd !== undefined) updateData.work_hours_end = data.workHoursEnd;
    if (data.minResponseDelay !== undefined) updateData.min_response_delay = data.minResponseDelay;
    if (data.maxResponseDelay !== undefined) updateData.max_response_delay = data.maxResponseDelay;
    if (data.maxDraftsPerDay !== undefined) updateData.max_drafts_per_day = data.maxDraftsPerDay;
    if (data.maxAutoSendsPerDay !== undefined)
      updateData.max_auto_sends_per_day = data.maxAutoSendsPerDay;
    if (data.notifyOnDraft !== undefined) updateData.notify_on_draft = data.notifyOnDraft;
    if (data.notifyOnLowConfidence !== undefined)
      updateData.notify_on_low_confidence = data.notifyOnLowConfidence;
    if (data.notifyDailySummary !== undefined)
      updateData.notify_daily_summary = data.notifyDailySummary;

    updateData.updated_at = new Date().toISOString();

    // Upsert — создать если нет, обновить если есть
    const { error } = await supabase.from("ai_sales_settings").upsert(
      {
        user_id: session.userId,
        ...updateData,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[AI Sales] Settings update error:", error);
      return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("[AI Sales] Settings PUT error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

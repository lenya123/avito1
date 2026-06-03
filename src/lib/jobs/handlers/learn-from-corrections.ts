/**
 * BullMQ Handler: learn-from-corrections
 *
 * Ночной job (03:00 МСК). Анализирует правки за день,
 * генерирует новые правила и few-shot примеры,
 * создаёт новую версию промпта.
 */

import type { Job } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { learnFromCorrections } from "@/lib/ai/sales-agent";
import type { FewShotExample } from "@/types/database";

export interface LearnFromCorrectionsJobData {
  userId?: string; // если не указан — для всех пользователей
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function handleLearnFromCorrections(
  job: Job<LearnFromCorrectionsJobData>
): Promise<void> {
  const supabase = getSupabase();
  const specificUserId = job.data?.userId;

  console.log(
    `[learn-from-corrections] Starting nightly learning${specificUserId ? ` for user=${specificUserId}` : " for all users"}...`
  );

  // 1. Получить всех пользователей с AI-продажником
  let query = supabase.from("ai_sales_settings").select("user_id").eq("is_enabled", true);

  if (specificUserId) {
    query = query.eq("user_id", specificUserId);
  }

  const { data: users } = await query;

  if (!users?.length) {
    console.log("[learn-from-corrections] No active users, done");
    return;
  }

  for (const { user_id: userId } of users) {
    try {
      await processUserCorrections(supabase, userId);
    } catch (error) {
      console.error(`[learn-from-corrections] Error for user=${userId}:`, error);
    }
  }

  console.log("[learn-from-corrections] Done");
}

async function processUserCorrections(supabase: SupabaseClient, userId: string): Promise<void> {
  // 1. Получить неиспользованные правки
  const { data: corrections } = await supabase
    .from("ai_sales_corrections")
    .select(
      `
      id,
      original_text,
      corrected_text,
      correction_type,
      draft:ai_sales_drafts!draft_id(buyer_message)
    `
    )
    .eq("user_id", userId)
    .is("used_in_version_id", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!corrections?.length) {
    console.log(`[learn-from-corrections] No new corrections for user=${userId}`);
    return;
  }

  console.log(
    `[learn-from-corrections] Processing ${corrections.length} corrections for user=${userId}`
  );

  // 2. Получить текущий активный промпт
  const { data: activeVersion } = await supabase
    .from("ai_sales_prompt_versions")
    .select("id, version, system_prompt, few_shot_examples, learned_rules")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  const currentPrompt = activeVersion?.system_prompt || "";
  const currentRules = (activeVersion?.learned_rules as string[]) || [];
  const currentExamples = (activeVersion?.few_shot_examples as FewShotExample[]) || [];
  const currentVersion = activeVersion?.version || 0;

  // 3. Подготовить данные для анализа
  const correctionInputs = corrections.map((c) => ({
    original: c.original_text,
    corrected: c.corrected_text,
    buyerMessage: (c.draft as unknown as { buyer_message: string })?.buyer_message || "",
    correctionType: c.correction_type || "other",
  }));

  // 4. Вызвать AI для анализа
  const result = await learnFromCorrections(
    userId,
    correctionInputs,
    currentPrompt,
    currentRules,
    currentExamples
  );

  // 5. Посчитать accuracy (% одобрений без правки за последний период)
  const { count: totalDrafts } = await supabase
    .from("ai_sales_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["approved", "auto_sent"])
    .gte("generated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const { count: editedDrafts } = await supabase
    .from("ai_sales_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["approved"])
    .not("edited_draft", "is", null)
    .gte("generated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const accuracy =
    totalDrafts && totalDrafts > 0
      ? ((1 - (editedDrafts ?? 0) / totalDrafts) * 100).toFixed(1)
      : null;

  // 6. Создать новую версию промпта
  // Сначала деактивировать текущую
  if (activeVersion) {
    await supabase
      .from("ai_sales_prompt_versions")
      .update({ is_active: false })
      .eq("id", activeVersion.id);
  }

  const { data: newVersion } = await supabase
    .from("ai_sales_prompt_versions")
    .insert({
      user_id: userId,
      version: currentVersion + 1,
      system_prompt: result.updatedPrompt || currentPrompt,
      few_shot_examples: result.newExamples,
      learned_rules: result.newRules,
      correction_count: corrections.length,
      accuracy_at_creation: accuracy ? parseFloat(accuracy) : null,
      is_active: true,
    })
    .select("id")
    .single();

  // 7. Пометить правки как использованные
  if (newVersion) {
    const correctionIds = corrections.map((c) => c.id);
    await supabase
      .from("ai_sales_corrections")
      .update({ used_in_version_id: newVersion.id })
      .in("id", correctionIds);
  }

  console.log(
    `[learn-from-corrections] Created prompt v${currentVersion + 1} for user=${userId}: ` +
      `${result.newRules.length} rules, ${result.newExamples.length} examples, ` +
      `accuracy=${accuracy || "N/A"}%`
  );
  console.log(`[learn-from-corrections] Summary: ${result.summary}`);

  // TODO: Telegram уведомление владельцу (Фаза 3)
}

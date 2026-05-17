/**
 * BullMQ Handler: aggregate-sales-stats
 *
 * Ежедневная агрегация метрик AI-продажника (00:05 МСК).
 */

import type { Job } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export interface AggregateSalesStatsJobData {
  userId?: string;
  date?: string; // YYYY-MM-DD, по умолчанию вчера
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function handleAggregateSalesStats(
  job: Job<AggregateSalesStatsJobData>
): Promise<void> {
  const supabase = getSupabase();

  // Определяем дату (вчера по МСК)
  const targetDate =
    job.data?.date ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
      timeZone: "Europe/Moscow",
    });

  const dateStart = `${targetDate}T00:00:00+03:00`;
  const dateEnd = `${targetDate}T23:59:59+03:00`;

  console.log(`[aggregate-sales-stats] Aggregating for date=${targetDate}`);

  // Получить пользователей
  let query = supabase.from("ai_sales_settings").select("user_id").eq("is_enabled", true);

  if (job.data?.userId) {
    query = query.eq("user_id", job.data.userId);
  }

  const { data: users } = await query;
  if (!users?.length) {
    console.log("[aggregate-sales-stats] No active users");
    return;
  }

  for (const { user_id: userId } of users) {
    try {
      await aggregateForUser(supabase, userId, targetDate, dateStart, dateEnd);
    } catch (error) {
      console.error(`[aggregate-sales-stats] Error for user=${userId}:`, error);
    }
  }

  console.log("[aggregate-sales-stats] Done");
}

async function aggregateForUser(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  dateStart: string,
  dateEnd: string
): Promise<void> {
  // Получаем все черновики за день
  const { data: drafts } = await supabase
    .from("ai_sales_drafts")
    .select(
      "status, confidence, tokens_used, generation_time_ms, generated_at, reviewed_at, sent_at, edited_draft"
    )
    .eq("user_id", userId)
    .gte("generated_at", dateStart)
    .lte("generated_at", dateEnd);

  if (!drafts?.length) return;

  // Подсчёт по статусам
  const totalDrafts = drafts.length;
  const approved = drafts.filter((d) => d.status === "approved" && !d.edited_draft).length;
  const edited = drafts.filter((d) => d.status === "approved" && d.edited_draft).length;
  const rejected = drafts.filter((d) => d.status === "rejected").length;
  const autoSent = drafts.filter((d) => d.status === "auto_sent").length;
  const expired = drafts.filter((d) => d.status === "expired").length;

  // Скорость генерации
  const genTimes = drafts.filter((d) => d.generation_time_ms).map((d) => d.generation_time_ms!);
  const avgGenerationTime = genTimes.length
    ? Math.round(genTimes.reduce((a, b) => a + b, 0) / genTimes.length)
    : null;

  // Скорость реакции владельца
  const reviewTimes = drafts
    .filter((d) => d.reviewed_at && d.generated_at)
    .map((d) => {
      const gen = new Date(d.generated_at!).getTime();
      const rev = new Date(d.reviewed_at!).getTime();
      return Math.round((rev - gen) / 1000);
    });
  const avgReviewTime = reviewTimes.length
    ? Math.round(reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length)
    : null;

  // Общее время ответа (от генерации до отправки)
  const responseTimes = drafts
    .filter((d) => d.sent_at && d.generated_at)
    .map((d) => {
      const gen = new Date(d.generated_at!).getTime();
      const sent = new Date(d.sent_at!).getTime();
      return Math.round((sent - gen) / 1000);
    });
  const avgResponseTime = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  // Качество
  const totalActioned = approved + edited + autoSent;
  const approvalRate =
    totalActioned > 0
      ? parseFloat((((approved + autoSent) / totalActioned) * 100).toFixed(2))
      : null;
  const correctionRate =
    totalActioned > 0 ? parseFloat(((edited / totalActioned) * 100).toFixed(2)) : null;

  // Токены и стоимость
  const totalTokens = drafts.reduce((sum, d) => sum + (d.tokens_used || 0), 0);
  // GPT-4o-mini: ~$0.15/1M input + $0.60/1M output, упрощённо ~$0.30/1M
  const estimatedCost = parseFloat((totalTokens * 0.0000003).toFixed(4));

  // Входящие сообщения (из avito_messages за день)
  const { count: totalIncoming } = await supabase
    .from("avito_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("direction", "in")
    .gte("avito_created_at", dateStart)
    .lte("avito_created_at", dateEnd);

  // Upsert
  await supabase.from("ai_sales_daily_stats").upsert(
    {
      user_id: userId,
      date,
      total_incoming: totalIncoming ?? 0,
      total_drafts: totalDrafts,
      total_approved: approved,
      total_edited: edited,
      total_rejected: rejected,
      total_auto_sent: autoSent,
      total_expired: expired,
      avg_generation_time_ms: avgGenerationTime,
      avg_review_time_sec: avgReviewTime,
      avg_response_time_sec: avgResponseTime,
      approval_rate: approvalRate,
      correction_rate: correctionRate,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
    },
    { onConflict: "user_id,date" }
  );

  console.log(
    `[aggregate-sales-stats] user=${userId} date=${date}: ` +
      `${totalDrafts} drafts, ${approved} approved, ${edited} edited, ` +
      `${autoSent} auto, ${totalTokens} tokens, $${estimatedCost}`
  );
}

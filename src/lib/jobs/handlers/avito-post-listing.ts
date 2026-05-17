/**
 * Хендлер автопостинга объявления через stealth-браузер.
 * Полная реализация — Фаза 4 (миксование фото/обложек, рандом-метро,
 * генерация описания, заполнение формы Avito). Здесь — каркас, чтобы
 * worker/handlers компилировались; реальная логика добавляется в Фазе 4.
 */
import type { Job } from "bullmq";
import { createServiceClientLoose } from "@/lib/supabase/server";
import type { AvitoPostListingJobData } from "../queues";

export async function handleAvitoPostListing(
  job: Job<AvitoPostListingJobData>
): Promise<void> {
  const { postJobId } = job.data;
  const loose = createServiceClientLoose();

  await loose
    .from("avito_post_jobs")
    .update({ status: "processing", attempts: job.attemptsMade + 1 })
    .eq("id", postJobId);

  // Фаза 4: runAutopost(postJobId) — миксование фото, генерация описания,
  // браузерная публикация. Пока помечаем как failed с пояснением, чтобы
  // не зависало в processing.
  await loose
    .from("avito_post_jobs")
    .update({
      status: "failed",
      error_message: "Автопостинг будет реализован в Фазе 4",
    })
    .eq("id", postJobId);

  console.warn(`[avito-post-listing] STUB — пропуск ${postJobId} (Фаза 4)`);
}

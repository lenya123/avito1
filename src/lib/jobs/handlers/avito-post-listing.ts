/**
 * Хендлер автопостинга: генерация контента → микс/уникализация фото →
 * браузерная публикация через stealth-сессию (антидетект на магазин).
 */
import type { Job } from "bullmq";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { generateListingContent } from "@/lib/ai/listing-content";
import { mixPhotos } from "@/lib/avito/photo-mixer";
import { postListing } from "@/lib/avito/posting";
import { randomRingMetro } from "@/lib/constants/moscow-metro";
import type { AvitoPostListingJobData } from "../queues";
import type { AvitoPostJob } from "@/types/database";

export async function handleAvitoPostListing(
  job: Job<AvitoPostListingJobData>
): Promise<void> {
  const { postJobId } = job.data;
  const loose = createServiceClientLoose();
  const supabase = createServiceClient();

  const { data: jobRowRaw } = await loose
    .from("avito_post_jobs")
    .select("*")
    .eq("id", postJobId)
    .maybeSingle();
  const jobRow = jobRowRaw as AvitoPostJob | null;

  if (!jobRow) {
    console.warn(`[avito-post-listing] job ${postJobId} not found`);
    return;
  }
  if (jobRow.status === "published" || jobRow.status === "cancelled") return;

  await loose
    .from("avito_post_jobs")
    .update({ status: "processing", attempts: (jobRow.attempts ?? 0) + 1 })
    .eq("id", postJobId);

  try {
    // Товар (для фото/описания). // STUB: owner-panel — каталог панели владельца.
    let productPhotos: string[] = [];
    let title = jobRow.title;
    let description = jobRow.description ?? "";

    if (jobRow.product_id) {
      // loose: products.city отсутствует в database.generated.ts до db:gen-types
      const { data: productRaw } = await loose
        .from("products")
        .select("name, description, brand, category, photo_urls, photo_main_index, measurements, city")
        .eq("id", jobRow.product_id)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = productRaw as any;

      if (product) {
        productPhotos = (product.photo_urls as string[] | null) ?? [];
        if (!title || !description) {
          const gen = await generateListingContent({
            name: product.name,
            description: product.description,
            brand: product.brand,
            category: product.category,
            price: jobRow.price,
            measurements:
              (product.measurements as Record<string, Record<string, number>> | null) ?? null,
          });
          title = title || gen.title;
          description = description || gen.description;
        }
      }
    }

    // Микс фото: обложка (живая/Nano Banana) + живой фотосет, всё уникализируем
    const mixed = await mixPhotos(jobRow.user_id, productPhotos);
    if (mixed.buffers.length === 0) {
      throw new Error("Нет фото для публикации (добавьте пресеты или фото товара)");
    }

    const metro = jobRow.metro || randomRingMetro();

    const result = await postListing(jobRow.session_id, {
      title,
      description,
      price: jobRow.price,
      city: jobRow.city || "Москва",
      metro,
      photos: mixed.buffers,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    await loose
      .from("avito_post_jobs")
      .update({
        status: "published",
        avito_item_id: result.avitoItemId,
        avito_item_url: result.avitoItemUrl,
        title,
        description,
        metro,
        photo_plan: mixed.plan,
        published_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", postJobId);

    // Минимальная строка в кеше — синк дополнит метрики.
    // Без зависимости от уникального индекса: проверяем наличие, потом вставляем.
    if (result.avitoItemId) {
      const numericId = Number(result.avitoItemId);
      const { data: existing } = await supabase
        .from("avito_items")
        .select("id")
        .eq("session_id", jobRow.session_id)
        .eq("avito_item_id", numericId)
        .maybeSingle();
      if (!existing) {
        await supabase.from("avito_items").insert({
          user_id: jobRow.user_id,
          session_id: jobRow.session_id,
          avito_item_id: numericId,
          title,
          price: jobRow.price,
          status: "active",
          url: result.avitoItemUrl,
          synced_at: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }
    }

    console.log(`[avito-post-listing] published ${postJobId} → ${result.avitoItemUrl}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка автопостинга";
    await loose
      .from("avito_post_jobs")
      .update({ status: "failed", error_message: msg })
      .eq("id", postJobId);
    console.error(`[avito-post-listing] failed ${postJobId}:`, msg);
    throw e; // BullMQ ретрайнет (attempts=3)
  }
}

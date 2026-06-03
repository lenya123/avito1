/**
 * Хендлер автопостинга: генерация контента → микс/уникализация фото →
 * браузерная публикация через stealth-сессию (антидетект на магазин).
 */
import type { Job } from "bullmq";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { generateListingContent } from "@/lib/ai/listing-content";
import { mixPhotos } from "@/lib/avito/photo-mixer";
import { submitAvitoListingViaCookies } from "@/lib/avito/web-client";
import { getWebSessionById } from "@/lib/avito";
import { resolveListingLocation } from "@/lib/avito/location-resolver";
import { bumpCoverUsage, bumpPhotosetSetUsage } from "@/lib/avito/ladder";
import { removePreparedImages } from "@/lib/avito/prepared-images";
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

    // Фото: если POST уже синхронно миксанул+уникализировал (Variant A) — берём ГОТОВЫЕ
    // из стораджа (не пере-микшируем); иначе (легаси/ночной путь) — микшируем здесь.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prepared = (jobRow as any).prepared_images as
      | { paths: string[]; coverPresetId: string | null; photosetSetKey: string | null; plan: unknown }
      | null;
    let buffers: Buffer[];
    let coverPresetId: string | null;
    let photosetSetKey: string | null;
    let photoPlan: unknown;
    if (prepared && Array.isArray(prepared.paths) && prepared.paths.length > 0) {
      const dl = await Promise.all(
        prepared.paths.map(async (p) => {
          const { data } = await supabase.storage.from("avito-presets").download(p);
          return data ? (Buffer.from(await data.arrayBuffer()) as Buffer) : null;
        })
      );
      buffers = dl.filter((b): b is Buffer => b !== null);
      coverPresetId = prepared.coverPresetId ?? null;
      photosetSetKey = prepared.photosetSetKey ?? null;
      photoPlan = prepared.plan ?? null;
    } else {
      const mixed = await mixPhotos(jobRow.user_id, jobRow.product_id ?? "", productPhotos, {
        manualSetKey:
          (jobRow as unknown as { manual_set_key: string | null }).manual_set_key ?? null,
        manualCoverPresetId:
          (jobRow as unknown as { manual_cover_preset_id: string | null }).manual_cover_preset_id ??
          null,
      });
      buffers = mixed.buffers;
      coverPresetId = mixed.coverPresetId;
      photosetSetKey = mixed.photosetSetKey;
      photoPlan = mixed.plan;
    }
    if (buffers.length === 0) {
      throw new Error("Нет фото для публикации (добавьте пресеты или фото товара)");
    }

    // Локация: Москва (кольцо+БКЛ) / Питер (центр) / др. город (адрес от нейронки).
    const loc = await resolveListingLocation(jobRow.city || "Москва");

    // Cookies-flow: загружаем фото на /web/1/images/upload → POST /item-add/submit/v2.
    const webSession = await getWebSessionById(jobRow.session_id);
    if (!webSession) {
      throw new Error("Сессия Avito недоступна (cookies не найдены)");
    }
    const result = await submitAvitoListingViaCookies(webSession, {
      title,
      description,
      price: jobRow.price,
      address: loc.address || loc.city,
      metro: loc.metro ?? jobRow.metro ?? null,
      photos: buffers,
    });
    if (!result.ok) {
      throw new Error(result.message ?? "Avito отказал в публикации");
    }

    // Лестница: учитываем использование только после успешной публикации.
    if (coverPresetId) await bumpCoverUsage(coverPresetId);
    if (photosetSetKey) await bumpPhotosetSetUsage(jobRow.user_id, photosetSetKey);

    await loose
      .from("avito_post_jobs")
      .update({
        status: "published",
        avito_item_id: result.avitoItemId,
        avito_item_url: result.avitoItemUrl,
        title,
        description,
        metro: loc.metro,
        photo_plan: photoPlan,
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
    // Финальный провал (retries исчерпаны) → джоба объявлением не стала,
    // подготовленные уникализированные фото больше не нужны: чистим сторадж,
    // чтобы publish-батчи не копились вечно. Промежуточные фейлы НЕ трогаем —
    // следующий retry скачивает те же prepared_images. maxAttempts по умолчанию
    // = defaultJobOptions.attempts (3) из queues.ts.
    const maxAttempts = job.opts.attempts ?? 3;
    const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;
    const update: Record<string, unknown> = { status: "failed", error_message: msg };
    if (isFinalAttempt) {
      const removed = await removePreparedImages(jobRow.prepared_images);
      if (removed) {
        update.prepared_images = null;
        console.log(`[avito-post-listing] cleaned ${removed} prepared images of failed ${postJobId}`);
      }
    }
    await loose.from("avito_post_jobs").update(update).eq("id", postJobId);
    console.error(`[avito-post-listing] failed ${postJobId}:`, msg);
    throw e; // BullMQ ретрайнет (attempts=3)
  }
}

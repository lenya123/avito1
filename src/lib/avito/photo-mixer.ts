/**
 * Микс фото для автопостинга:
 *  • 1 обложка — случайный пресет kind='cover' ИЛИ сгенерённая Nano Banana
 *    из фото товара (если живых обложек нет / редко — для разнообразия);
 *  • полный живой фотосет — все фото одного случайного set_key
 *    (kind='photoset');
 *  • всё прогоняется через уникализатор (sharp).
 *
 * Возвращает массив JPEG-буферов в порядке загрузки (обложка первой).
 */
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { uniqueizeImage } from "@/lib/media/uniqueize";
import { generateCover } from "@/lib/ai/cover-generator";
import type { AvitoMediaPreset } from "@/types/database";

const BUCKET = "avito-presets";
const pick = <T>(arr: T[]): T | null =>
  arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

async function downloadPreset(storagePath: string, publicUrl: string | null): Promise<Buffer | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (!error && data) return Buffer.from(await data.arrayBuffer());
  // Фолбэк на публичный URL
  if (publicUrl) {
    try {
      const res = await fetch(publicUrl);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* ignore */
    }
  }
  return null;
}

export interface PhotoPlan {
  cover: { presetId: string; path: string } | null;
  photoset: Array<{ presetId: string; path: string }>;
}

export interface MixedPhotos {
  buffers: Buffer[]; // готовые к загрузке (уникализированы), обложка первой
  plan: PhotoPlan; // что именно выбрали (для логов avito_post_jobs.photo_plan)
  coverGenerated: boolean;
}

/**
 * Собрать и уникализировать комплект фото для одной выкладки.
 * @param userId оператор
 * @param productPhotoUrls фото товара (для генерации обложки при отсутствии пресетов)
 */
export async function mixPhotos(
  userId: string,
  productPhotoUrls: string[] = []
): Promise<MixedPhotos> {
  const loose = createServiceClientLoose();

  const { data: presetsRaw } = await loose
    .from("avito_media_presets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  const presets = (presetsRaw ?? []) as AvitoMediaPreset[];
  const covers = presets.filter((p) => p.kind === "cover");
  const photosetItems = presets.filter((p) => p.kind === "photoset" && p.set_key);

  const buffers: Buffer[] = [];
  const plan: PhotoPlan = { cover: null, photoset: [] };
  let coverGenerated = false;

  // --- Обложка ---
  // ~30% выкладок (или если живых обложек нет) — генерим Nano Banana,
  // иначе берём случайную живую обложку из банка.
  const useGenerated = covers.length === 0 || Math.random() < 0.3;
  if (useGenerated && productPhotoUrls.length) {
    const gen = await generateCover(productPhotoUrls);
    if (gen) {
      buffers.push(await uniqueizeImage(gen.buffer, { maxWidth: 1600 }));
      coverGenerated = gen.generated;
    }
  }
  if (buffers.length === 0 && covers.length) {
    const cov = pick(covers)!;
    const buf = await downloadPreset(cov.storage_path, cov.public_url);
    if (buf) {
      buffers.push(await uniqueizeImage(buf, { maxWidth: 1600 }));
      plan.cover = { presetId: cov.id, path: cov.storage_path };
    }
  }

  // --- Живой фотосет (весь, одного set_key) ---
  const setKeys = Array.from(new Set(photosetItems.map((p) => p.set_key!)));
  const chosenKey = pick(setKeys);
  if (chosenKey) {
    const setPhotos = photosetItems
      .filter((p) => p.set_key === chosenKey)
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const ph of setPhotos) {
      const buf = await downloadPreset(ph.storage_path, ph.public_url);
      if (buf) {
        buffers.push(await uniqueizeImage(buf, { maxWidth: 1600 }));
        plan.photoset.push({ presetId: ph.id, path: ph.storage_path });
      }
    }
  }

  return { buffers, plan, coverGenerated };
}

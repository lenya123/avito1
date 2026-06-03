import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "avito-presets";

/**
 * Форма `avito_post_jobs.prepared_images` (Variant A заливает её в POST
 * /api/avito/post): 10 уникализированных фото, готовых к публикации.
 */
export interface PreparedImages {
  paths?: string[];
  coverPresetId?: string | null;
  photosetSetKey?: string | null;
  coverGenerated?: boolean;
  plan?: unknown;
}

/**
 * Удалить временные уникализированные фото выкладки из стораджа
 * (`avito-presets/{userId}/publish/{batchId}/NN.jpg`).
 *
 * Политика жизни этих файлов: они нужны, пока джоба может стать / остаётся
 * живым объявлением. Чистим их когда:
 *  • джоба окончательно ПРОВАЛИЛАСЬ (retries исчерпаны) — объявлением не стала;
 *  • удаляют само объявление (будущая фича удаления — вызовет этот же хелпер).
 * published-джобы НЕ чистим — их фото живут, пока живёт объявление.
 *
 * Идемпотентно: пустой/уже почищенный набор → no-op. Ошибку стораджа
 * не пробрасываем (чистка — best-effort, не должна валить вызывающий флоу).
 *
 * @returns сколько объектов реально удалили
 */
export async function removePreparedImages(
  prepared: PreparedImages | null | undefined
): Promise<number> {
  const paths = prepared?.paths ?? [];
  if (!paths.length) return 0;
  try {
    const storage = createServiceClient().storage.from(BUCKET);
    const { error } = await storage.remove(paths);
    if (error) {
      console.warn("[prepared-images] remove failed:", error.message);
      return 0;
    }
    return paths.length;
  } catch (e) {
    console.warn("[prepared-images] remove threw:", e instanceof Error ? e.message : e);
    return 0;
  }
}

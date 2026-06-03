/**
 * Микс фото для выкладки на Авито.
 *
 * Основной путь (ladder, ТЗ) — `mixPhotos`:
 *  10 фото = 1 обложка/превью + 9 живой фотосет.
 *  • Обложка (слот 1): ручной выбор (manualCoverPresetId) ИЛИ лестница —
 *    наименее использованное среди kind IN ('preview','cover','ai-preview').
 *    Если банк обложек пуст — фолбэк: генерим Nano Banana из фото товара.
 *  • Фотосет (слоты 2..10): ручной выбор (manualSetKey) ИЛИ лестница —
 *    наименее использованный живой фотосет; берём все его фото (до 9).
 *  • Всё прогоняется через уникализатор (sharp).
 *
 * Инкремент счётчиков лестницы — НЕ здесь, а в хендлере после успешной публикации
 * (см. coverPresetId/photosetSetKey в результате).
 *
 * Альтернативный путь (random, легаси автопостинга) — `mixPhotosRandom`:
 *  • 1 обложка — случайный пресет kind='cover' ИЛИ сгенерённая Nano Banana
 *    из фото товара (если живых обложек нет / редко — для разнообразия);
 *  • полный живой фотосет — все фото одного случайного set_key (kind='photoset');
 *  • всё прогоняется через уникализатор (sharp).
 *  Возвращает массив JPEG-буферов в порядке загрузки (обложка первой).
 */
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { uniqueizeImage, pHash } from "@/lib/media/uniqueize";
import { generateCover } from "@/lib/ai/cover-generator";
import type { AvitoMediaPreset } from "@/types/database";
import {
  pickLeastUsedCover,
  pickLeastUsedPhotosetSet,
  getPhotosetBySetKey,
  getCoverPresetById,
  type LadderPreset,
} from "./ladder";

const BUCKET = "avito-presets";
const PHOTOSET_SLOTS = 9; // 1 обложка + 9 фотосет = 10
const PHASH_HISTORY = 20; // сколько pHash прошлых выкладок храним на пресет (avoidHashes)

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
  cover: { source: "preset" | "generated"; preset_id?: string; storage_path?: string } | null;
  photoset: { preset_set_key: string; count: number } | null;
}

export interface MixOptions {
  /** Ручной выбор фотосета (NULL/undefined = лестница). */
  manualSetKey?: string | null;
  /** Ручной выбор обложки (NULL/undefined = лестница). */
  manualCoverPresetId?: string | null;
}

export interface MixedPhotos {
  buffers: Buffer[]; // готовые к загрузке (уникализированы), обложка первой
  plan: PhotoPlan; // что выбрали (для логов avito_post_jobs.photo_plan)
  coverGenerated: boolean;
  /** id обложки-пресета для бампа лестницы после публикации (null если сгенерили). */
  coverPresetId: string | null;
  /** set_key фотосета для бампа лестницы после публикации. */
  photosetSetKey: string | null;
}

/**
 * Собрать и уникализировать комплект из 10 фото для одной выкладки (ladder).
 * @param userId оператор
 * @param productId товар (для пер-товарной лестницы обложек/фотосетов)
 * @param productPhotoUrls фото товара (фолбэк-генерация обложки при пустом банке)
 * @param opts ручной выбор обложки/фотосета
 */
export async function mixPhotos(
  userId: string,
  productId: string,
  productPhotoUrls: string[] = [],
  opts: MixOptions = {}
): Promise<MixedPhotos> {
  const loose = createServiceClientLoose();
  const plan: PhotoPlan = { cover: null, photoset: null };
  let coverGenerated = false;
  let coverPresetId: string | null = null;
  let photosetSetKey: string | null = null;

  // ─── Выбор обложки (слот 1) ───
  let cover: LadderPreset | null = null;
  if (opts.manualCoverPresetId) cover = await getCoverPresetById(userId, opts.manualCoverPresetId);
  if (!cover) cover = await pickLeastUsedCover(userId, productId);

  // ─── Выбор фотосета (слоты 2..10) ───
  let setKey: string | null = opts.manualSetKey ?? null;
  if (!setKey) {
    const chosen = await pickLeastUsedPhotosetSet(userId, productId);
    setKey = chosen?.set_key ?? null;
  }
  const setPhotos = setKey ? (await getPhotosetBySetKey(userId, setKey)).slice(0, PHOTOSET_SLOTS) : [];

  // ─── Грузим pHash прошлых выкладок выбранных пресетов (avoidHashes) ───
  const presetIds = [cover?.id, ...setPhotos.map((p) => p.id)].filter((x): x is string => !!x);
  const priorHashes = new Map<string, string[]>();
  if (presetIds.length) {
    const { data } = await loose
      .from("avito_media_presets")
      .select("id, published_phashes")
      .in("id", presetIds);
    for (const r of (data ?? []) as Array<{ id: string; published_phashes: unknown }>) {
      priorHashes.set(r.id, Array.isArray(r.published_phashes) ? (r.published_phashes as string[]) : []);
    }
  }

  // Уникализация пресет-фото с учётом avoidHashes; запоминаем новый pHash для истории.
  const newHashByPreset = new Map<string, string>();
  const uniqPreset = async (presetId: string, raw: Buffer): Promise<Buffer> => {
    const out = await uniqueizeImage(raw, {
      maxWidth: 1600,
      avoidHashes: priorHashes.get(presetId) ?? [],
    });
    try {
      newHashByPreset.set(presetId, await pHash(out));
    } catch {
      /* pHash необязателен для истории */
    }
    return out;
  };

  // ─── Обложка (с фолбэком на генерацию из фото товара) ───
  let coverBuf: Buffer | null = null;
  if (cover) {
    const raw = await downloadPreset(cover.storage_path, cover.public_url);
    if (raw) {
      coverBuf = await uniqPreset(cover.id, raw);
      plan.cover = { source: "preset", preset_id: cover.id, storage_path: cover.storage_path };
      coverPresetId = cover.id;
    }
  }
  if (!coverBuf && productPhotoUrls.length) {
    const gen = await generateCover(productPhotoUrls);
    if (gen) {
      coverBuf = await uniqueizeImage(gen.buffer, { maxWidth: 1600 }); // генерация и так уникальна
      coverGenerated = gen.generated;
      plan.cover = { source: "generated" };
    }
  }

  // ─── Живой фотосет (слоты 2..10) — скачиваем и уникализируем ПАРАЛЛЕЛЬНО ───
  const rawSet = await Promise.all(
    setPhotos.map((ph) => downloadPreset(ph.storage_path, ph.public_url).then((b) => ({ ph, b })))
  );
  const photosetBufs = await Promise.all(
    rawSet.filter((x): x is { ph: LadderPreset; b: Buffer } => !!x.b).map((x) => uniqPreset(x.ph.id, x.b))
  );
  if (photosetBufs.length && setKey) {
    plan.photoset = { preset_set_key: setKey, count: photosetBufs.length };
    photosetSetKey = setKey;
  }

  const buffers: Buffer[] = [];
  if (coverBuf) buffers.push(coverBuf);
  buffers.push(...photosetBufs);

  // ─── Сохраняем новые pHash в историю пресетов (для расхождения повторных выкладок) ───
  await Promise.all(
    Array.from(newHashByPreset.entries()).map(([pid, h]) => {
      const next = [...(priorHashes.get(pid) ?? []), h].slice(-PHASH_HISTORY);
      return loose.from("avito_media_presets").update({ published_phashes: next }).eq("id", pid);
    })
  );

  return { buffers, plan, coverGenerated, coverPresetId, photosetSetKey };
}

export interface RandomPhotoPlan {
  cover: { presetId: string; path: string } | null;
  photoset: Array<{ presetId: string; path: string }>;
}

export interface RandomMixedPhotos {
  buffers: Buffer[]; // готовые к загрузке (уникализированы), обложка первой
  plan: RandomPhotoPlan; // что именно выбрали (для логов avito_post_jobs.photo_plan)
  coverGenerated: boolean;
}

/**
 * Собрать и уникализировать комплект фото для одной выкладки (random/легаси).
 * @param userId оператор
 * @param productPhotoUrls фото товара (для генерации обложки при отсутствии пресетов)
 */
export async function mixPhotosRandom(
  userId: string,
  productPhotoUrls: string[] = []
): Promise<RandomMixedPhotos> {
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
  const plan: RandomPhotoPlan = { cover: null, photoset: [] };
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

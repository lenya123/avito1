/**
 * Лестница ротации медиа для автопостинга: «что меньше использовано — то и берём
 * следующим». Счётчики держим на обложках/превью (avito_media_presets.usage_count)
 * и на живых фотосетах (avito_photoset_sets.usage_count). Инкремент — только после
 * успешной публикации (вызывает хендлер avito-post-listing).
 *
 * Обложку-кандидата выбираем среди kind IN ('preview','cover','ai-preview')
 * (живые превью с инета + ручные обложки + одобренные AI-генерации).
 */
import { createServiceClientLoose } from "@/lib/supabase/server";

export interface LadderPreset {
  id: string;
  user_id: string;
  kind: string;
  set_key: string | null;
  storage_path: string;
  public_url: string | null;
  sort_order: number;
  usage_count: number;
  last_used_at: string | null;
}

export interface PhotosetSet {
  set_key: string;
  title: string | null;
}

const COVER_KINDS = ["preview", "cover", "ai-preview"];

/** Наименее использованная обложка/превью ТОВАРА (preview/cover/ai-preview, или null). */
export async function pickLeastUsedCover(
  userId: string,
  productId: string
): Promise<LadderPreset | null> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_media_presets")
    .select("*")
    .eq("user_id", userId)
    // Обложки строго ПЕР-ТОВАР: ai-preview (генерации) + preview/cover, загруженные
    // в карточке этого товара. Глобальный микс убран — чтобы на обложку не попадала
    // картинка другого товара.
    .eq("product_id", productId)
    .eq("is_active", true)
    .in("kind", COVER_KINDS)
    .order("usage_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1);
  const row = (data ?? [])[0] as LadderPreset | undefined;
  return row ?? null;
}

/** Наименее использованный живой фотосет ТОВАРА (или null). */
export async function pickLeastUsedPhotosetSet(
  userId: string,
  productId: string
): Promise<PhotosetSet | null> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_photoset_sets")
    .select("set_key, title")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("usage_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1);
  const row = (data ?? [])[0] as PhotosetSet | undefined;
  return row ?? null;
}

/** Все фото одного фотосета по set_key (упорядочены по sort_order). */
export async function getPhotosetBySetKey(
  userId: string,
  setKey: string
): Promise<LadderPreset[]> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_media_presets")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "photoset")
    .eq("set_key", setKey)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as LadderPreset[];
}

/** Конкретная обложка по id (для ручного выбора). */
export async function getCoverPresetById(
  userId: string,
  presetId: string
): Promise<LadderPreset | null> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_media_presets")
    .select("*")
    .eq("user_id", userId)
    .eq("id", presetId)
    .maybeSingle();
  return (data as LadderPreset | null) ?? null;
}

/** Пресеты по списку id (для ручного выбора исходных фото датасета). Порядок — по sort_order. */
export async function getPresetsByIds(
  userId: string,
  ids: string[]
): Promise<LadderPreset[]> {
  if (!ids.length) return [];
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_media_presets")
    .select("*")
    .eq("user_id", userId)
    .in("id", ids)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as LadderPreset[];
}

/** Наименее использованный референс глобальной библиотеки (kind='photozone'|'personality'). */
export async function pickLeastUsedReference(
  userId: string,
  kind: "photozone" | "personality"
): Promise<LadderPreset | null> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_media_presets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("kind", kind)
    .order("usage_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1);
  const row = (data ?? [])[0] as LadderPreset | undefined;
  return row ?? null;
}

/** N наименее использованных референсов — чтобы подать несколько вариантов зон Gemini
 *  (он выберет лучшую) и ротировать окно по лестнице. */
export async function pickLeastUsedReferences(
  userId: string,
  kind: "photozone" | "personality",
  limit: number
): Promise<LadderPreset[]> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_media_presets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("kind", kind)
    .order("usage_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data ?? []) as LadderPreset[];
}

/** +1 к использованию обложки/превью (после успешной публикации). */
export async function bumpCoverUsage(presetId: string): Promise<void> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_media_presets")
    .select("usage_count")
    .eq("id", presetId)
    .maybeSingle();
  const current = ((data as { usage_count: number } | null)?.usage_count ?? 0) + 1;
  await loose
    .from("avito_media_presets")
    .update({ usage_count: current, last_used_at: new Date().toISOString() })
    .eq("id", presetId);
}

/** +1 к использованию фотосета (после успешной публикации). */
export async function bumpPhotosetSetUsage(userId: string, setKey: string): Promise<void> {
  const loose = createServiceClientLoose();
  const { data } = await loose
    .from("avito_photoset_sets")
    .select("usage_count")
    .eq("user_id", userId)
    .eq("set_key", setKey)
    .maybeSingle();
  const current = ((data as { usage_count: number } | null)?.usage_count ?? 0) + 1;
  await loose
    .from("avito_photoset_sets")
    .update({ usage_count: current, last_used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("set_key", setKey);
}

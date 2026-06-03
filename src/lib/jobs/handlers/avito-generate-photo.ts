/**
 * Хендлер AI-генерации фото объявления (3 категории) с подтверждением в owner-bot.
 *
 *  1. (если не «Переделай») атомарно занимаем слот дневного лимита
 *     claim_ai_gen_slot — caps: normal=2, photozone=2, personality=1 (=5/день/товар);
 *  2. берём до 3 живых фото товара (products.photo_urls) как источник;
 *  3. для photozone/personality — референс из глобальной библиотеки
 *     (kind='photozone'|'personality', наименее использованный или заданный);
 *  4. генерим фото (Gemini multi-source);
 *  5. кладём в avito-presets/${userId}/ai-pending/... + строку avito_ai_generations (pending);
 *  6. шлём владельцу на подтверждение «Четко»/«Переделай», сохраняем message_id.
 *
 * «Переделай» НЕ тратит дневной слот (regenerateOf задан → пропускаем claim).
 */
import { randomUUID } from "crypto";
import type { Job } from "bullmq";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { moscowToday } from "@/lib/utils/moscow-time";
import { generateProductPhoto, type AiPhotoCategory } from "@/lib/ai/photo-generator";
import {
  pickLeastUsedReferences,
  pickLeastUsedPhotosetSet,
  getPhotosetBySetKey,
  getPresetsByIds,
  bumpCoverUsage,
  type LadderPreset,
} from "@/lib/avito/ladder";
import { notifyOwnerAiPhotoForApproval, notifyAiPhotoFailure } from "@/lib/telegram/notifications";
import type { AvitoGeneratePhotoJobData } from "../queues";

const CAPS: Record<AiPhotoCategory, number> = { normal: 2, photozone: 2, personality: 1 };
const CATEGORY_LABEL: Record<AiPhotoCategory, string> = {
  normal: "Живой фон",
  photozone: "Фотозона",
  personality: "На модели",
};
const BUCKET = "avito-presets";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function presetFetchUrl(preset: LadderPreset): Promise<string | null> {
  // Подписанный URL работает и для приватного, и для публичного бакета —
  // надёжнее, чем public_url (бакет avito-presets может быть приватным).
  const supabase = createServiceClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(preset.storage_path, 600);
  return data?.signedUrl ?? preset.public_url ?? null;
}

export async function handleAvitoGeneratePhoto(
  job: Job<AvitoGeneratePhotoJobData>
): Promise<void> {
  const { userId, regenerateOf } = job.data;
  let { productId, category } = job.data;
  const loose = createServiceClientLoose();
  const supabase = createServiceClient();

  // Контекст «Переделай» — попытка инкрементится, слот не тратится.
  let attempt = 1;
  let regenChatId: number | null = null; // получатель из исходной генерации (сохраняем при regenerate)
  if (regenerateOf) {
    const { data: old } = await loose
      .from("avito_ai_generations")
      .select("attempt, category, product_id, reference_preset_id, tg_chat_id")
      .eq("id", regenerateOf)
      .eq("user_id", userId) // скоуп по владельцу — нельзя переделать чужую генерацию
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = old as any;
    if (o) {
      attempt = (o.attempt ?? 1) + 1;
      category = o.category as AiPhotoCategory;
      productId = o.product_id as string;
      regenChatId = (o.tg_chat_id as number | null) ?? null;
    }
  }

  // Получатель «Четко/Переделай»: chat_id создателя товара (recipientChatId) → при «Переделай»
  // берём из исходной генерации. БЕЗ дефолта на владельца: получатель не задан → НИЧЕГО не
  // генерируем и не шлём (решение владельца). Проверяем ДО claim/Gemini — не тратим слот и токены.
  const recipientId = job.data.recipientChatId ?? regenChatId ?? null;
  if (recipientId == null) {
    console.warn(`[avito-generate-photo] нет получателя (cover_tg_chat_id) у ${productId} — skip, ничего не шлём`);
    return;
  }

  // Дневной лимит — атомарный захват слота.
  if (!regenerateOf) {
    const { data: claimed } = await loose.rpc("claim_ai_gen_slot", {
      p_user_id: userId,
      p_product_id: productId,
      p_date: moscowToday(),
      p_category: category,
      p_cap: CAPS[category],
    });
    if (!claimed) {
      console.warn(`[avito-generate-photo] daily limit reached: ${productId} / ${category}`);
      return;
    }
  }

  // Товар — только для контекста промта (имя/категория).
  const { data: productRaw } = await loose
    .from("products")
    .select("name, category")
    .eq("id", productId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const product = productRaw as any;
  if (!product) {
    console.warn(`[avito-generate-photo] product ${productId} not found`);
    return;
  }

  // Исходники AI (ТЗ: 3 фото из живого фотосета товара):
  //  • ручной выбор фото из датасета (sourcePresetIds, при создании объявления), ИЛИ
  //  • авто — наименее использованный живой фотосет товара (лестница).
  let livePhotoUrls: string[] = [];
  let sourceSetKey: string | null = null;

  const manualIds =
    !regenerateOf && job.data.sourcePresetIds?.length ? job.data.sourcePresetIds : null;
  if (manualIds) {
    const chosen = (await getPresetsByIds(userId, manualIds)).slice(0, 3);
    livePhotoUrls = (await Promise.all(chosen.map((p) => presetFetchUrl(p)))).filter(
      (u): u is string => !!u
    );
    sourceSetKey = chosen[0]?.set_key ?? null;
  }
  if (livePhotoUrls.length === 0) {
    const photosetSet = await pickLeastUsedPhotosetSet(userId, productId);
    if (!photosetSet) {
      console.warn(`[avito-generate-photo] у товара ${productId} нет живого фотосета — skip`);
      return;
    }
    const photosetPhotos = (await getPhotosetBySetKey(userId, photosetSet.set_key)).slice(0, 3);
    livePhotoUrls = (await Promise.all(photosetPhotos.map((p) => presetFetchUrl(p)))).filter(
      (u): u is string => !!u
    );
    sourceSetKey = photosetSet.set_key;
  }
  if (livePhotoUrls.length === 0) {
    console.warn(`[avito-generate-photo] нет исходных фото для товара ${productId} — skip`);
    return;
  }
  console.log(
    `[avito-generate-photo] source=${manualIds ? "manual" : "ladder"} photos=${livePhotoUrls.length} set=${sourceSetKey}`
  );

  // Фотозона: подаём НЕСКОЛЬКО наименее использованных зон — Gemini сам выберет лучшую
  // под товар. Бампим все отправленные (ротация окна) → следующая генерация возьмёт другие.
  // «На модели» (personality) и «Живой фон» (normal) — без зон, сцену/модель строит из промта.
  let referenceUrls: string[] = [];
  let usedZoneId: string | null = null;
  if (category === "photozone") {
    const zones = await pickLeastUsedReferences(userId, "photozone", 3);
    if (zones.length === 0) {
      console.warn(`[avito-generate-photo] no photozone references in library — skip`);
      return;
    }
    referenceUrls = (await Promise.all(zones.map((z) => presetFetchUrl(z)))).filter(
      (u): u is string => !!u
    );
    usedZoneId = zones[0]?.id ?? null;
    for (const z of zones) await bumpCoverUsage(z.id);
  }

  // Генерация.
  const result = await generateProductPhoto({
    livePhotoUrls,
    referenceUrls,
    category,
    extraPrompt: product.name ? `Товар: ${product.name}` : undefined,
  });
  if (!result) {
    const reason =
      category === "personality"
        ? "AI отказался компоновать с личностью (Gemini блокирует реальные лица). Попробуй «Фотозона» или референс без реального лица."
        : "AI не вернул изображение. Попробуй ещё раз или другую категорию.";
    console.warn(`[avito-generate-photo] no image (${category}) for ${productId} — ${reason}`);
    // «Переделай» не должен зависнуть в regenerating, если генерация провалилась.
    if (regenerateOf) {
      await loose
        .from("avito_ai_generations")
        .update({ status: "pending" })
        .eq("id", regenerateOf)
        .eq("user_id", userId);
    }
    // Не молчим: иначе клик по категории «ничего не делает». Шлём ПОЛУЧАТЕЛЮ товара
    // (recipientId = cover_tg_chat_id), а не глобальному OWNER_TELEGRAM_ID — провал
    // этой генерации видит тот, кто её заказал (тот же чат, что и сами фото).
    await notifyAiPhotoFailure({
      chatId: recipientId,
      message: `🖼 AI-фото · ${CATEGORY_LABEL[category]}\nТовар: ${escapeHtml(product.name ?? "")}\n\n⚠️ ${reason}`,
    }).catch(() => {});
    return;
  }

  // Заливаем в storage + строка pending.
  const genId = randomUUID();
  const ext = result.mime.includes("png") ? "png" : "jpg";
  const storagePath = `${userId}/ai-pending/${genId}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, result.buffer, { contentType: result.mime, upsert: true });
  if (upErr) {
    console.error(`[avito-generate-photo] upload failed:`, upErr);
    return;
  }

  const { error: insErr } = await loose.from("avito_ai_generations").insert({
    id: genId,
    user_id: userId,
    product_id: productId,
    category,
    status: "pending",
    storage_path: storagePath,
    public_url: null,
    reference_preset_id: usedZoneId,
    source_photoset_set_key: sourceSetKey,
    attempt,
  });
  if (insErr) {
    // Строка не создалась — кнопки слать нельзя (genId не найдётся при «Четко/Переделай»).
    // Чтобы исходная генерация не зависла навсегда в 'regenerating', возвращаем её в 'pending'.
    console.error(`[avito-generate-photo] insert avito_ai_generations failed (${genId}):`, insErr);
    if (regenerateOf) {
      await loose
        .from("avito_ai_generations")
        .update({ status: "pending" })
        .eq("id", regenerateOf)
        .eq("user_id", userId);
    }
    throw new Error(`avito_ai_generations insert failed: ${insErr.message}`);
  }

  // Получатель уже определён выше (recipientId) — без дефолта на владельца.
  const caption =
    `🖼 AI-фото · ${CATEGORY_LABEL[category]}\n` +
    `Товар: ${escapeHtml(product.name ?? "")}\n` +
    `Попытка #${attempt}\n` +
    `Одобрить в ротацию?`;
  const messageId = await notifyOwnerAiPhotoForApproval({
    generationId: genId,
    buffer: result.buffer,
    caption,
    chatId: recipientId,
  });
  if (messageId) {
    await loose
      .from("avito_ai_generations")
      .update({ tg_message_id: messageId, tg_chat_id: recipientId })
      .eq("id", genId);
  }

  console.log(`[avito-generate-photo] generated ${genId} (${category}) for product ${productId}`);
}

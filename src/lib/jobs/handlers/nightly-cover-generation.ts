/**
 * Ночная автогенерация AI-обложек (03:00 МСК).
 * Проходит по товарам с auto_covers_enabled=true (активным, не удалённым, у кого есть
 * живой фотосет) и ставит каждому батч из 5 генераций (2 normal + 2 photozone + 1 personality).
 * Дневной cap (claim_ai_gen_slot) внутри хендлера генерации не даст задвоить с ручной кнопкой.
 * Результаты приходят создателю товара (cover_tg_chat_id) на «Четко/Переделай».
 */
import type { Job } from "bullmq";
import { createServiceClientLoose } from "@/lib/supabase/server";
import { enqueueProductCoverBatch } from "../queues";

export async function handleNightlyCoverGeneration(_job: Job): Promise<void> {
  const loose = createServiceClientLoose();

  const { data: products } = await loose
    .from("products")
    .select("id, cover_tg_chat_id")
    .eq("auto_covers_enabled", true)
    .eq("is_active", true)
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (products ?? []) as any[];
  console.log(`[nightly-cover-generation] товаров с автогенерацией: ${list.length}`);

  let enqueued = 0;
  for (const p of list) {
    // Нет получателя (cover_tg_chat_id) → НЕ генерируем и не шлём (решение владельца:
    // если человек не привязал chat_id — ему ничего не отправляем). Кнопка/тумблер в карточке
    // тоже завязаны на сохранённый chat_id.
    if (!p.cover_tg_chat_id) {
      console.log(`[nightly-cover-generation] skip ${p.id} — не задан cover_tg_chat_id`);
      continue;
    }
    // userId берём у владельца загруженного фотосета товара; заодно проверяем, что фотосет есть.
    const { data: ps } = await loose
      .from("avito_media_presets")
      .select("user_id")
      .eq("product_id", p.id)
      .eq("kind", "photoset")
      .eq("is_active", true)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = ((ps ?? [])[0] as any)?.user_id as string | undefined;
    if (!userId) {
      console.log(`[nightly-cover-generation] skip ${p.id} — нет живого фотосета`);
      continue;
    }
    await enqueueProductCoverBatch(userId, p.id as string, (p.cover_tg_chat_id as number | null) ?? null);
    enqueued++;
  }

  console.log(`[nightly-cover-generation] поставлено батчей: ${enqueued}`);
}

import type { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "avito-presets";
const SIGNED_TTL = 3600; // приватный бакет → подписанный URL живёт 1ч

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Аватарка товара = «Живая обложка». Если у товара есть загруженная живая
 * обложка (`avito_media_presets` kind='preview', самая первая по `sort_order`),
 * она В ПРИОРИТЕТЕ над `products.photo_urls[0]`. Бакет приватный, поэтому
 * отдаём подписанный URL (TTL 1ч).
 *
 * ЕДИНЫЙ источник аватарки товара для всех экранов (меню «Товары», карточка
 * товара, модалка «Создать объявление») — не переизобретать в каждом роуте.
 *
 * Возвращает Map `productId → signedUrl` ТОЛЬКО для товаров, у которых живая
 * обложка реально есть; остальные товары падают на свой `photo_urls`-fallback
 * на стороне вызывающего.
 */
export async function getLiveCoverMap(
  supabase: ServiceClient,
  productIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (productIds.length === 0) return result;

  const { data: covers } = await supabase
    .from("avito_media_presets")
    .select("product_id, storage_path, sort_order")
    .eq("kind", "preview")
    .eq("is_active", true)
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });

  // Первый пресет (минимальный sort_order) на товар.
  const firstPathByProduct = new Map<string, string>();
  for (const c of (covers ?? []) as Array<{
    product_id: string | null;
    storage_path: string;
  }>) {
    if (c.product_id && !firstPathByProduct.has(c.product_id)) {
      firstPathByProduct.set(c.product_id, c.storage_path);
    }
  }

  await Promise.all(
    Array.from(firstPathByProduct.entries()).map(async ([pid, path]) => {
      const { data: s } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_TTL);
      if (s?.signedUrl) result.set(pid, s.signedUrl);
    })
  );

  return result;
}

/** Single-product враппер над {@link getLiveCoverMap}: живая обложка или null. */
export async function getLiveCoverUrl(
  supabase: ServiceClient,
  productId: string
): Promise<string | null> {
  const map = await getLiveCoverMap(supabase, [productId]);
  return map.get(productId) ?? null;
}

/**
 * Выборка каталога для customer-bot.
 *
 * Работает через service-role Supabase client (RLS обходится — бот
 * не имеет пользовательской сессии).
 *
 * Доступность размера в новой модели = есть свободный остаток у владельца
 * ИЛИ хотя бы у одной живой привязки партнёра (с активным партнёром
 * и реквизитами для partner_warehouse / без требований для owner_warehouse).
 * RPC `select_size_source` инкапсулирует выбор источника на оформлении.
 */

import { getBotDb } from "../db";
import type { Database } from "@/types/database.generated";
import { sortSizeEntries, sortSizes } from "@/utils/sizes";

export type CatalogProduct = Database["public"]["Tables"]["products"]["Row"];
export type CatalogProductSize = Database["public"]["Tables"]["product_sizes"]["Row"];

export interface ProductSearchResult {
  products: CatalogProduct[];
  hasMore: boolean;
}

/**
 * Свободный остаток партнёрских привязок per-(product, size). Только для
 * "пригодных" привязок: partner.is_active И (warehouse=owner OR
 * payment_requisites IS NOT NULL).
 */
async function fetchPartnerStockMap(
  productIds: string[]
): Promise<Map<string, Map<string, number>>> {
  const map = new Map<string, Map<string, number>>();
  if (productIds.length === 0) return map;

  const db = getBotDb();
  const { data, error } = await db
    .from("product_partner_size_stock")
    .select(
      "size, current_quantity, reserved_quantity, binding:product_partner_bindings!inner(product_id, deleted_at, warehouse_kind, partner:partners!inner(is_active, payment_requisites))"
    )
    .in("binding.product_id", productIds);

  if (error) {
    console.error("fetchPartnerStockMap failed:", error);
    return map;
  }

  type Row = {
    size: string;
    current_quantity: number;
    reserved_quantity: number;
    binding:
      | {
          product_id: string;
          deleted_at: string | null;
          warehouse_kind: string;
          partner: { is_active: boolean | null; payment_requisites: unknown } | null;
        }
      | Array<{
          product_id: string;
          deleted_at: string | null;
          warehouse_kind: string;
          partner: { is_active: boolean | null; payment_requisites: unknown } | null;
        }>;
  };

  for (const raw of (data ?? []) as Row[]) {
    const binding = Array.isArray(raw.binding) ? raw.binding[0] : raw.binding;
    if (!binding || binding.deleted_at) continue;
    const partnerActive = binding.partner?.is_active === true;
    const hasRequisites = binding.partner?.payment_requisites != null;
    if (!partnerActive) continue;
    if (binding.warehouse_kind === "partner" && !hasRequisites) continue;
    const free = (raw.current_quantity ?? 0) - (raw.reserved_quantity ?? 0);
    if (free <= 0) continue;

    let perProduct = map.get(binding.product_id);
    if (!perProduct) {
      perProduct = new Map();
      map.set(binding.product_id, perProduct);
    }
    perProduct.set(raw.size, (perProduct.get(raw.size) ?? 0) + free);
  }
  return map;
}

/**
 * Поиск товаров для inline-режима бота. Пустой `query` → возвращает
 * «топ»: премиум-товары первыми, потом новые → старые.
 *
 * Доступность: товар отображается, если есть хотя бы один доступный размер
 * (свой или партнёрский по лестнице).
 */
export async function searchProducts(opts: {
  query: string;
  offset: number;
  limit: number;
}): Promise<ProductSearchResult> {
  const db = getBotDb();
  const trimmed = opts.query.trim();

  // Берём с запасом — товары без доступных размеров отбрасываем после.
  const fetchLimit = (opts.limit + 1) * 2;

  let q = db.from("products").select("*").eq("is_active", true).is("deleted_at", null);

  if (trimmed.length > 0) {
    const escaped = trimmed.replace(/[%_]/g, (c) => `\\${c}`);
    q = q.ilike("name", `%${escaped}%`);
  }

  const { data, error } = await q
    .order("is_premium", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(opts.offset, opts.offset + fetchLimit);

  if (error) {
    console.error("searchProducts failed:", error);
    return { products: [], hasMore: false };
  }

  const rows = (data ?? []) as CatalogProduct[];
  const productIds = rows.map((r) => r.id);

  // Собираем (product_id, size) → есть ли свободный остаток (свой ИЛИ партнёр).
  const [ownerStock, partnerStock] = await Promise.all([
    db
      .from("product_sizes")
      .select("product_id, size, current_quantity, reserved_quantity")
      .in("product_id", productIds),
    fetchPartnerStockMap(productIds),
  ]);

  const ownerAvailable = new Set<string>();
  for (const row of ownerStock.data ?? []) {
    if (!row.product_id || !row.size) continue;
    const free = (row.current_quantity ?? 0) - (row.reserved_quantity ?? 0);
    if (free > 0) ownerAvailable.add(`${row.product_id}|${row.size}`);
  }

  const ownerProductIdsAvailable = new Set<string>();
  ownerAvailable.forEach((key) => {
    const sep = key.indexOf("|");
    if (sep > 0) ownerProductIdsAvailable.add(key.slice(0, sep));
  });

  const filtered = rows.filter((row) => {
    if (ownerProductIdsAvailable.has(row.id)) return true;
    const partnerSizes = partnerStock.get(row.id);
    return !!partnerSizes && partnerSizes.size > 0;
  });

  const hasMore = filtered.length > opts.limit;
  const products = hasMore ? filtered.slice(0, opts.limit) : filtered;
  return { products, hasMore };
}

/**
 * Доступные размеры (free > 0) для набора товаров — одной выборкой.
 * Учитывает свой сток + партнёрские лестницы.
 */
export async function fetchAvailableSizesByProductIds(
  productIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, Set<string>>();
  if (productIds.length === 0) return new Map();

  const db = getBotDb();
  const [{ data: ownerRows, error: ownerErr }, partnerStock] = await Promise.all([
    db
      .from("product_sizes")
      .select("product_id, size, current_quantity, reserved_quantity")
      .in("product_id", productIds),
    fetchPartnerStockMap(productIds),
  ]);

  if (ownerErr) {
    console.error("fetchAvailableSizesByProductIds owner failed:", ownerErr);
  }

  for (const row of ownerRows ?? []) {
    if (!row.product_id || !row.size) continue;
    const free = (row.current_quantity ?? 0) - (row.reserved_quantity ?? 0);
    if (free <= 0) continue;
    let set = map.get(row.product_id);
    if (!set) {
      set = new Set();
      map.set(row.product_id, set);
    }
    set.add(row.size);
  }

  partnerStock.forEach((sizes, productId) => {
    let set = map.get(productId);
    if (!set) {
      set = new Set();
      map.set(productId, set);
    }
    sizes.forEach((_, size) => set!.add(size));
  });

  const result = new Map<string, string[]>();
  map.forEach((set, productId) => {
    result.set(productId, sortSizes(Array.from(set)));
  });
  return result;
}

/**
 * Размер с суммарным свободным остатком: owner-сток (через product_sizes)
 * плюс агрегат всех живых партнёрских привязок (тот же фильтр что в
 * fetchPartnerStockMap). Используется в карточке товара чтобы показать
 * клиенту реальное количество, а не только owner-сток.
 */
export type CatalogSizeWithStock = CatalogProductSize & { freeTotal: number };

export interface ProductWithSizes {
  product: CatalogProduct;
  sizes: CatalogSizeWithStock[];
}

/**
 * Карточка товара: сам товар + только доступные размеры
 * (`current_quantity - reserved_quantity > 0` у владельца ИЛИ у партнёра).
 *
 * Возвращает sizes из `product_sizes` (это «канон» размеров товара —
 * партнёр не может продавать размер, которого нет в products).
 */
export async function fetchProductWithSizes(productId: string): Promise<ProductWithSizes | null> {
  const db = getBotDb();

  const [{ data: product, error: productError }, { data: sizes, error: sizesError }, partnerStock] =
    await Promise.all([
      db.from("products").select("*").eq("id", productId).single(),
      db.from("product_sizes").select("*").eq("product_id", productId),
      fetchPartnerStockMap([productId]),
    ]);

  if (productError || !product) {
    console.error("fetchProductWithSizes: product failed", productError);
    return null;
  }
  if (sizesError) {
    console.error("fetchProductWithSizes: sizes failed", sizesError);
    return { product, sizes: [] };
  }

  const partnerSizes = partnerStock.get(productId) ?? new Map<string, number>();

  const available: CatalogSizeWithStock[] = [];
  for (const s of sizes ?? []) {
    const ownerFree = Math.max(0, (s.current_quantity ?? 0) - (s.reserved_quantity ?? 0));
    const partnerFree = partnerSizes.get(s.size) ?? 0;
    const freeTotal = ownerFree + partnerFree;
    if (freeTotal > 0) available.push({ ...s, freeTotal });
  }

  return { product, sizes: sortSizeEntries(available) };
}

/**
 * URL главной фотографии товара (если есть).
 */
export function mainPhotoUrl(product: CatalogProduct): string | null {
  const urls = product.photo_urls;
  if (!urls || urls.length === 0) return null;
  const idx = product.photo_main_index ?? 0;
  return urls[idx] ?? urls[0] ?? null;
}

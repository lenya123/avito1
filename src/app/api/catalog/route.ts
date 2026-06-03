/**
 * GET /api/catalog — публичный список активных товаров для лендинг-каталога.
 *
 * Без авторизации. Возвращает только то, что нужно карточке списка:
 * фото, название, drop/recommended цены, размеры с количеством и
 * статус наличия. Подробные замеры — в `/api/catalog/[id]`.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sortSizeEntries } from "@/utils/sizes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CatalogSize {
  id: string;
  size: string;
  available: number;
}

interface CatalogProductListItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  drop_price: number;
  recommended_price: number | null;
  photo_urls: string[];
  photo_main_index: number;
  is_in_stock: boolean;
  expected_arrival_date: string | null;
  sizes: CatalogSize[];
}

export async function GET() {
  const supabase = createServiceClient();

  const { data: products, error } = await supabase
    .from("products")
    .select(
      `id, name, description, category, drop_price, recommended_price,
       photo_urls, photo_main_index, is_in_stock, expected_arrival_date,
       product_sizes (id, size, current_quantity, reserved_quantity)`
    )
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[catalog] list error:", error);
    return NextResponse.json({ error: "Не удалось загрузить каталог" }, { status: 500 });
  }

  const items: CatalogProductListItem[] = (products ?? []).map((p) => {
    const rawSizes = (p.product_sizes ?? []) as Array<{
      id: string;
      size: string;
      current_quantity: number;
      reserved_quantity: number | null;
    }>;
    const sizes: CatalogSize[] = sortSizeEntries(rawSizes)
      .map((s) => ({
        id: s.id,
        size: s.size,
        available: Math.max(0, (s.current_quantity ?? 0) - (s.reserved_quantity ?? 0)),
      }))
      .filter((s) => s.available > 0);

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      drop_price: Number(p.drop_price),
      recommended_price: p.recommended_price !== null ? Number(p.recommended_price) : null,
      photo_urls: p.photo_urls ?? [],
      photo_main_index: p.photo_main_index ?? 0,
      is_in_stock: p.is_in_stock ?? true,
      expected_arrival_date: p.expected_arrival_date,
      sizes,
    };
  });

  return NextResponse.json({ items });
}

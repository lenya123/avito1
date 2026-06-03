/**
 * GET /api/catalog/[id] — детали товара для модалки в публичном каталоге.
 *
 * Возвращает то же что и список + замеры по каждому размеру (JSON из
 * `product_sizes.measurements`). Без авторизации.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sortSizeEntries } from "@/utils/sizes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      `id, name, description, category, drop_price, recommended_price,
       photo_urls, photo_main_index, is_in_stock, expected_arrival_date,
       product_sizes (id, size, current_quantity, reserved_quantity, measurements)`
    )
    .eq("id", id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[catalog] detail error:", error);
    return NextResponse.json({ error: "Не удалось загрузить товар" }, { status: 500 });
  }

  if (!product) {
    return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  }

  const rawSizes = (product.product_sizes ?? []) as Array<{
    id: string;
    size: string;
    current_quantity: number;
    reserved_quantity: number | null;
    measurements: unknown;
  }>;

  const sizes = sortSizeEntries(rawSizes).map((s) => ({
    id: s.id,
    size: s.size,
    available: Math.max(0, (s.current_quantity ?? 0) - (s.reserved_quantity ?? 0)),
    measurements: (s.measurements as Record<string, number> | null) ?? null,
  }));

  return NextResponse.json({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    drop_price: Number(product.drop_price),
    recommended_price:
      product.recommended_price !== null ? Number(product.recommended_price) : null,
    photo_urls: product.photo_urls ?? [],
    photo_main_index: product.photo_main_index ?? 0,
    is_in_stock: product.is_in_stock ?? true,
    expected_arrival_date: product.expected_arrival_date,
    sizes,
  });
}

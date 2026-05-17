import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";
import { sortSizes } from "@/utils/sizes";

const querySchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  search: z.string().optional(),
  inStock: z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const result = querySchema.safeParse(params);

    if (!result.success) {
      return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    }

    const { category, brand, search, inStock } = result.data;

    const supabase = createServiceClient();
    const isPremium =
      session.isVibePlus ||
      session.subscriptionTier === "premium" ||
      session.subscriptionTier === "top_floor_boss";

    // Базовый запрос для товаров с размерами
    // Получаем все подходящие товары один раз, затем вычисляем доступные фильтры
    let baseQuery = supabase
      .from("products")
      .select(
        `
        id,
        category,
        brand,
        is_in_stock,
        sizes:product_sizes(size, current_quantity, reserved_quantity)
      `
      )
      .eq("is_active", true);

    // Фильтр по premium
    if (!isPremium) {
      baseQuery = baseQuery.eq("is_premium", false);
    }

    // Фильтр по наличию (для не-premium — только в наличии)
    if (inStock === "true" || !isPremium) {
      baseQuery = baseQuery.eq("is_in_stock", true);
    }

    // Поиск
    if (search) {
      baseQuery = baseQuery.or(`name.ilike.%${search}%,brand.ilike.%${search}%`);
    }

    const { data: allProducts, error } = await baseQuery;

    if (error) {
      console.error("Filters fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки фильтров" }, { status: 500 });
    }

    // Фильтруем товары по доступным размерам (только с остатком > 0)
    type ProductSize = { size: string; current_quantity: number; reserved_quantity: number | null };
    type ProductWithSizes = {
      id: string;
      category: string | null;
      brand: string | null;
      is_in_stock: boolean;
      sizes: ProductSize[] | null;
    };

    const productsWithStock =
      (allProducts as ProductWithSizes[])?.filter((product) => {
        const availableSizes = product.sizes?.filter(
          (s) => s.current_quantity > (s.reserved_quantity || 0)
        );
        return availableSizes && availableSizes.length > 0;
      }) || [];

    // 1. Категории — всегда все доступные
    const allCategories = Array.from(
      new Set(productsWithStock.map((p) => p.category).filter((x): x is string => !!x))
    ).sort();

    // 2. Бренды — фильтруем по выбранной категории
    const productsForBrands = category
      ? productsWithStock.filter((p) => p.category === category)
      : productsWithStock;

    const availableBrands = Array.from(
      new Set(productsForBrands.map((p) => p.brand).filter((x): x is string => !!x))
    ).sort();

    // 3. Размеры — фильтруем по категории и бренду
    let productsForSizes = productsWithStock;
    if (category) {
      productsForSizes = productsForSizes.filter((p) => p.category === category);
    }
    if (brand) {
      productsForSizes = productsForSizes.filter((p) => p.brand === brand);
    }

    const availableSizesSet = new Set<string>();
    for (const product of productsForSizes) {
      const sizes = product.sizes?.filter((s) => s.current_quantity > (s.reserved_quantity || 0));
      sizes?.forEach((s) => availableSizesSet.add(s.size));
    }
    const availableSizes = sortSizes(Array.from(availableSizesSet));

    // 4. Подсчёт количества товаров для каждого значения фильтра
    // Это поможет показать (15) рядом с названием фильтра
    const categoryCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};
    const sizeCounts: Record<string, number> = {};

    // Счётчики для категорий (без фильтра по категории)
    for (const product of productsWithStock) {
      if (product.category) {
        categoryCounts[product.category] = (categoryCounts[product.category] || 0) + 1;
      }
    }

    // Счётчики для брендов (с учётом категории)
    for (const product of productsForBrands) {
      if (product.brand) {
        brandCounts[product.brand] = (brandCounts[product.brand] || 0) + 1;
      }
    }

    // Счётчики для размеров (с учётом категории и бренда)
    for (const product of productsForSizes) {
      const sizes = product.sizes?.filter((s) => s.current_quantity > (s.reserved_quantity || 0));
      sizes?.forEach((s) => {
        sizeCounts[s.size] = (sizeCounts[s.size] || 0) + 1;
      });
    }

    return NextResponse.json({
      categories: allCategories.map((cat) => ({
        value: cat,
        count: categoryCounts[cat] || 0,
      })),
      brands: availableBrands.map((b) => ({
        value: b,
        count: brandCounts[b] || 0,
      })),
      sizes: availableSizes.map((s) => ({
        value: s,
        count: sizeCounts[s] || 0,
      })),
      // Также возвращаем общее количество товаров с текущими фильтрами
      totalProducts: productsForSizes.length,
    });
  } catch (error) {
    console.error("Filters API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

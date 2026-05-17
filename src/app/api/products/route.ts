import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  category: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  inStock: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).default("newest"),
  favorites: z.enum(["true", "false"]).optional(),
  premiumOnly: z.enum(["true", "false"]).optional(),
});

/**
 * Очищает истёкшие резервы и возвращает их quantity
 */
async function cleanupExpiredReservations(supabase: SupabaseClient): Promise<void> {
  const { data: expiredReservations } = await supabase
    .from("size_reservations")
    .select("id, product_size_id")
    .lt("expires_at", new Date().toISOString());

  if (!expiredReservations || expiredReservations.length === 0) return;

  for (const reservation of expiredReservations) {
    if (reservation.product_size_id) {
      const { data: productSize } = await supabase
        .from("product_sizes")
        .select("reserved_quantity")
        .eq("id", reservation.product_size_id)
        .single();

      if (productSize) {
        await supabase
          .from("product_sizes")
          .update({
            reserved_quantity: Math.max((productSize.reserved_quantity || 0) - 1, 0),
          })
          .eq("id", reservation.product_size_id);
      }
    }
    await supabase.from("size_reservations").delete().eq("id", reservation.id);
  }
}

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
      return NextResponse.json(
        { error: "Неверные параметры", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, category, brand, size, inStock, search, sort, favorites, premiumOnly } =
      result.data;
    const offset = (page - 1) * limit;

    const supabase = createServiceClient();

    // Очищаем истёкшие резервы при загрузке продуктов
    await cleanupExpiredReservations(supabase);
    const isPremium =
      session.isVibePlus ||
      session.subscriptionTier === "premium" ||
      session.subscriptionTier === "top_floor_boss";

    // Базовый запрос
    let query = supabase
      .from("products")
      .select(
        `
        *,
        sizes:product_sizes(*)
      `,
        { count: "exact" }
      )
      .eq("is_active", true);

    // Фильтр по premium товарам
    if (!isPremium) {
      query = query.eq("is_premium", false);
    } else if (premiumOnly === "true") {
      // Для premium пользователей: показать только premium товары
      query = query.eq("is_premium", true);
    }

    // Фильтр по наличию (для не-premium показываем только в наличии)
    if (inStock === "true") {
      query = query.eq("is_in_stock", true);
    } else if (!isPremium) {
      query = query.eq("is_in_stock", true);
    }

    // Фильтр по категории
    if (category) {
      query = query.eq("category", category);
    }

    // Фильтр по бренду
    if (brand) {
      query = query.eq("brand", brand);
    }

    // Поиск по названию
    if (search) {
      query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%`);
    }

    // Фильтр по избранному
    if (favorites === "true") {
      const { data: favIds } = await supabase
        .from("favorites")
        .select("product_id")
        .eq("user_id", session.userId);

      if (favIds && favIds.length > 0) {
        const productIds = favIds
          .map((f) => f.product_id)
          .filter((id): id is string => id !== null);
        query = query.in("id", productIds);
      } else {
        // Если избранных нет, возвращаем пустой массив
        return NextResponse.json({
          products: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }
    }

    // Сортировка
    switch (sort) {
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "price_asc":
        query = query.order("drop_price", { ascending: true });
        break;
      case "price_desc":
        query = query.order("drop_price", { ascending: false });
        break;
    }

    // Пагинация
    query = query.range(offset, offset + limit - 1);

    const { data: products, error, count } = await query;

    if (error) {
      console.error("Products fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки товаров" }, { status: 500 });
    }

    // Фильтр по размеру (после получения данных, т.к. размеры в отдельной таблице)
    let filteredProducts = products || [];
    if (size) {
      filteredProducts = filteredProducts.filter((product) =>
        product.sizes?.some(
          (s: { size: string; current_quantity: number; reserved_quantity: number | null }) =>
            s.size === size && s.current_quantity > (s.reserved_quantity || 0)
        )
      );
    }

    // Получаем избранные для текущего пользователя
    const { data: userFavorites } = await supabase
      .from("favorites")
      .select("product_id")
      .eq("user_id", session.userId);

    const favoriteIds = new Set(userFavorites?.map((f) => f.product_id) || []);

    // Добавляем флаг избранного
    const productsWithFavorites = filteredProducts.map((product) => ({
      ...product,
      isFavorite: favoriteIds.has(product.id),
      // Вычисляем доступные размеры
      availableSizes:
        product.sizes
          ?.filter(
            (s: { current_quantity: number; reserved_quantity: number | null }) =>
              s.current_quantity > (s.reserved_quantity || 0)
          )
          .map((s: { size: string }) => s.size) || [],
    }));

    return NextResponse.json({
      products: productsWithFavorites,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Products API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

// Хелпер для получения сессии владельца
async function getOwnerSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    if (session.role !== "owner") return null;
    return session;
  } catch {
    return null;
  }
}

// GET - список товаров
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  stock: z.enum(["all", "in_stock", "in_transit", "out_of_stock"]).default("all"),
  premium: z.enum(["all", "yes", "no"]).default("all"),
  category: z.string().optional(),
  sort: z.enum(["created_at", "name", "price", "stock"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      stock: searchParams.get("stock") ?? undefined,
      premium: searchParams.get("premium") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });

    const supabase = createServiceClient();

    // Базовый запрос
    let query = supabase.from("products").select(
      `
        id,
        name,
        brand,
        category,
        purchase_price,
        drop_price,
        recommended_price,
        photo_urls,
        is_active,
        is_premium,
        is_in_stock,
        expected_arrival_date,
        created_at,
        product_sizes(id, size, current_quantity, initial_quantity)
      `,
      { count: "exact" }
    );

    // Фильтры
    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,brand.ilike.%${params.search}%`);
    }

    if (params.status === "active") {
      query = query.eq("is_active", true);
    } else if (params.status === "inactive") {
      query = query.eq("is_active", false);
    }

    if (params.stock === "in_stock") {
      query = query.eq("is_in_stock", true);
    } else if (params.stock === "in_transit") {
      query = query.eq("is_in_stock", false).not("expected_arrival_date", "is", null);
    } else if (params.stock === "out_of_stock") {
      query = query.eq("is_in_stock", false).is("expected_arrival_date", null);
    }

    if (params.premium === "yes") {
      query = query.eq("is_premium", true);
    } else if (params.premium === "no") {
      query = query.eq("is_premium", false);
    }

    if (params.category) {
      query = query.eq("category", params.category);
    }

    // Сортировка
    if (params.sort === "name") {
      query = query.order("name", { ascending: params.order === "asc" });
    } else if (params.sort === "price") {
      query = query.order("drop_price", { ascending: params.order === "asc" });
    } else {
      query = query.order("created_at", { ascending: params.order === "asc" });
    }

    // Пагинация
    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;
    query = query.range(from, to);

    const { data: products, error, count } = await query;

    if (error) {
      console.error("Products fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки товаров" }, { status: 500 });
    }

    // Получаем статистику продаж для товаров
    const productIds = products?.map((p) => p.id) || [];
    const { data: salesData } = await supabase
      .from("orders")
      .select("product_id, client_price")
      .in("product_id", productIds)
      .eq("status", "completed");

    // Группируем продажи
    const salesStats: Record<string, { sold: number; revenue: number }> = {};
    salesData?.forEach((order) => {
      const pid = order.product_id;
      if (!pid) return;
      if (!salesStats[pid]) {
        salesStats[pid] = { sold: 0, revenue: 0 };
      }
      salesStats[pid].sold += 1;
      salesStats[pid].revenue += order.client_price || 0;
    });

    // Формируем ответ
    const productsWithStats = products?.map((product) => {
      const sizes =
        (product.product_sizes as Array<{
          id: string;
          size: string;
          current_quantity: number;
          initial_quantity: number;
        }>) || [];
      const totalStock = sizes.reduce((sum, s) => sum + s.current_quantity, 0);
      const totalInitial = sizes.reduce((sum, s) => sum + s.initial_quantity, 0);

      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        purchasePrice: product.purchase_price,
        dropPrice: product.drop_price,
        recommendedPrice: product.recommended_price,
        photoUrl: product.photo_urls?.[0] || null,
        isActive: product.is_active,
        isPremium: product.is_premium,
        isInStock: product.is_in_stock,
        expectedArrivalDate: product.expected_arrival_date,
        createdAt: product.created_at,
        sizes: sizes.map((s) => ({
          size: s.size,
          current: s.current_quantity,
          initial: s.initial_quantity,
        })),
        totalStock,
        totalInitial,
        sales: salesStats[product.id] || { sold: 0, revenue: 0 },
      };
    });

    // Общая статистика
    const { data: allProductsStats } = await supabase
      .from("products")
      .select("id, is_active, is_in_stock");

    const summary = {
      total: allProductsStats?.length || 0,
      active: allProductsStats?.filter((p) => p.is_active).length || 0,
      inStock: allProductsStats?.filter((p) => p.is_in_stock).length || 0,
    };

    // Категории для фильтров
    const { data: categories } = await supabase
      .from("products")
      .select("category")
      .not("category", "is", null);

    const uniqueCategories = Array.from(new Set(categories?.map((c) => c.category))).filter(
      Boolean
    );

    return NextResponse.json({
      products: productsWithStats,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / params.limit),
      },
      summary,
      categories: uniqueCategories,
    });
  } catch (error) {
    console.error("Products API error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST - создание товара
const createProductSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  brand: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  purchasePrice: z.number().min(0, "Цена должна быть положительной"),
  dropPrice: z.number().min(0, "Цена должна быть положительной"),
  recommendedPrice: z.number().optional(),
  photoUrls: z.array(z.string()).optional(),
  isPremium: z.boolean().default(false),
  isInStock: z.boolean().default(true),
  expectedArrivalDate: z.string().optional(),
  supplierId: z.string().optional(),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1),
        quantity: z.number().min(0),
      })
    )
    .default([]),
  measurements: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = createProductSchema.parse(body);

    const supabase = createServiceClient();

    // Создаём товар
    const hasSizes = data.sizes.length > 0;
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        name: data.name,
        brand: data.brand,
        category: data.category,
        description: data.description,
        purchase_price: data.purchasePrice,
        drop_price: data.dropPrice,
        recommended_price: data.recommendedPrice,
        photo_urls: data.photoUrls,
        is_premium: data.isPremium,
        is_in_stock: data.isInStock,
        is_active: true,
        expected_arrival_date: data.expectedArrivalDate,
        supplier_id: data.supplierId,
        measurements: data.measurements,
        created_by: session.userId,
        purchase_quantity: hasSizes ? data.sizes.reduce((sum, s) => sum + s.quantity, 0) : 0,
      })
      .select()
      .single();

    if (productError) {
      console.error("Product create error:", productError);
      return NextResponse.json({ error: "Ошибка создания товара" }, { status: 500 });
    }

    // Создаём размеры (если есть)
    if (hasSizes) {
      const sizesData = data.sizes.map((s) => ({
        product_id: product.id,
        size: s.size,
        initial_quantity: s.quantity,
        current_quantity: s.quantity,
      }));

      const { error: sizesError } = await supabase.from("product_sizes").insert(sizesData);

      if (sizesError) {
        console.error("Sizes create error:", sizesError);
        await supabase.from("products").delete().eq("id", product.id);
        return NextResponse.json({ error: "Ошибка создания размеров" }, { status: 500 });
      }
    }

    // Логируем
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "product_created",
      entity_type: "product",
      entity_id: product.id,
      details: { name: data.name },
    });

    return NextResponse.json({ success: true, productId: product.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("Product create API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";
import { buildSizeRowsForInsert } from "@/lib/products/one-size";
import { sortSizeEntries } from "@/utils/sizes";

const querySchema = z.object({
  search: z.string().optional(),
  filter: z.enum(["all", "in_stock", "out_of_stock"]).optional(),
});

const createProductSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(200),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1).max(10),
        quantity: z.number().min(0),
      })
    )
    .optional(),
  quantity: z.number().min(0).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      search: searchParams.get("search") || undefined,
      filter: searchParams.get("filter") || undefined,
    });

    const supabase = createServiceClient();

    // Моно-бизнес: все товары принадлежат одному владельцу, фильтрация по seller_id
    // не нужна после пивота.

    let query = supabase
      .from("products")
      .select(
        `
        id,
        name,
        category,
        photo_urls,
        current_quantity,
        reserved_quantity,
        is_in_stock,
        is_active,
        expected_arrival_date,
        actual_quantity,
        product_sizes (
          id,
          size,
          current_quantity,
          reserved_quantity,
          actual_quantity
        )
      `
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    // Фильтр по наличию
    if (params.filter === "in_stock") {
      query = query.eq("is_in_stock", true);
    } else if (params.filter === "out_of_stock") {
      query = query.eq("is_in_stock", false);
    }

    // Поиск по имени
    if (params.search) {
      const search = `%${params.search}%`;
      query = query.ilike("name", search);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Stock fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    const products = (data || []).map((product) => {
      const sizes = sortSizeEntries(product.product_sizes || []);
      const hasSizes = sizes.length > 0;

      // Общее доступное количество
      const totalCurrent = hasSizes
        ? sizes.reduce(
            (sum: number, s: { current_quantity: number }) => sum + s.current_quantity,
            0
          )
        : (product.current_quantity ?? 0);

      const totalReserved = hasSizes
        ? sizes.reduce(
            (sum: number, s: { reserved_quantity: number | null }) =>
              sum + (s.reserved_quantity ?? 0),
            0
          )
        : (product.reserved_quantity ?? 0);

      return {
        id: product.id,
        name: product.name,
        category: product.category,
        photoUrl: product.photo_urls?.[0] || null,
        currentQuantity: product.current_quantity ?? 0,
        reservedQuantity: product.reserved_quantity ?? 0,
        isInStock: product.is_in_stock,
        expectedArrivalDate: product.expected_arrival_date,
        sizes: sizes.map(
          (s: {
            id: string;
            size: string;
            current_quantity: number;
            reserved_quantity: number | null;
            actual_quantity: number | null;
          }) => ({
            id: s.id,
            size: s.size,
            currentQuantity: s.current_quantity,
            reservedQuantity: s.reserved_quantity ?? 0,
            actualQuantity: s.actual_quantity,
          })
        ),
        totalAvailable: totalCurrent - totalReserved,
        totalCurrent,
        totalReserved,
        totalActual: hasSizes
          ? sizes.some((s: { actual_quantity: number | null }) => s.actual_quantity === null)
            ? null
            : sizes.reduce(
                (sum: number, s: { actual_quantity: number | null }) =>
                  sum + (s.actual_quantity ?? 0),
                0
              )
          : (product.actual_quantity ?? null),
      };
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Shipper stock error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = createProductSchema.parse(body);

    const hasSizes = data.sizes && data.sizes.length > 0;

    const supabase = createServiceClient();

    // location_city стал NOT NULL (2026-05-14): подтягиваем дефолт из
    // настроек, fallback на 'Москва' если у владельца не задан.
    const { data: settings } = await supabase
      .from("settings")
      .select("default_location_city")
      .limit(1)
      .maybeSingle();
    const locationCity = settings?.default_location_city ?? "Москва";

    // Моно-бизнес: владелец и shipper создают товар напрямую, без seller-атрибуции.
    // Создаём товар. is_in_stock не выставляем руками —
    // триггер product_sizes_sync_stock_* пересчитает после insert размеров.
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        name: data.name,
        is_active: true,
        current_quantity: hasSizes ? 0 : (data.quantity ?? 0),
        reserved_quantity: 0,
        purchase_price: 0,
        drop_price: 0,
        recommended_price: 0,
        photo_urls: [],
        location_city: locationCity,
      })
      .select("id")
      .single();

    if (productError || !product) {
      console.error("Product create error:", productError);
      return NextResponse.json({ error: "Ошибка создания товара" }, { status: 500 });
    }

    // Создаём размеры (или One Size для sizeless — чтобы триггер увидел сток).
    // Нормализуем регистр входных размеров (шипер вводит вручную).
    const normalizedSizes = (data.sizes ?? []).map((s) => ({
      size: s.size.toUpperCase(),
      quantity: s.quantity,
    }));
    const sizesData = buildSizeRowsForInsert(product.id, normalizedSizes, data.quantity ?? 0);

    const { error: sizesError } = await supabase.from("product_sizes").insert(sizesData);

    if (sizesError) {
      console.error("Sizes create error:", sizesError);
      // Откатываем товар
      await supabase.from("products").delete().eq("id", product.id);
      return NextResponse.json({ error: "Ошибка создания размеров" }, { status: 500 });
    }

    // Логируем
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "stock_product_created",
      entity_type: "product",
      entity_id: product.id,
      details: {
        product_name: data.name,
        sizes: data.sizes || null,
        quantity: data.quantity ?? null,
      },
    });

    return NextResponse.json({ success: true, productId: product.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Stock create error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

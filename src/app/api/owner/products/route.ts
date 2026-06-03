import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { aggregateLossByProduct } from "@/lib/stock/loss";
import { ownerRevenue } from "@/lib/finance/owner-revenue";
import { isRevenueCounted } from "@/lib/constants/pricing";
import { PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import { sortSizes, sortSizeEntries } from "@/utils/sizes";
import { getLiveCoverMap } from "@/lib/products/cover";

// Хелпер для получения сессии владельца

// GET - список товаров
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  stock: z.enum(["all", "in_stock", "in_transit", "out_of_stock", "low_stock"]).default("all"),
  loss: z.enum(["all", "with_loss"]).default("all"),
  premium: z.enum(["all", "yes", "no"]).default("all"),
  category: z.string().optional(),
  size: z.string().optional(),
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
      loss: searchParams.get("loss") ?? undefined,
      premium: searchParams.get("premium") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      size: searchParams.get("size") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });

    const supabase = createServiceClient();

    // Базовый запрос — если фильтр по размеру, используем inner join
    const sizesJoin = params.size
      ? "product_sizes!inner(id, size, current_quantity, initial_quantity)"
      : "product_sizes(id, size, current_quantity, initial_quantity)";

    let query = supabase.from("products").select(
      `
        id,
        name,
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
        ${sizesJoin}
      `,
      { count: "exact" }
    );

    // Фильтры
    // Всегда скрываем удалённые товары
    query = query.is("deleted_at", null);

    // Single-tenant: seller_id дропнут в Stage 1, все products принадлежат владельцу.

    if (params.search) {
      query = query.ilike("name", `%${params.search}%`);
    }

    if (params.status === "active") {
      query = query.eq("is_active", true);
    } else if (params.status === "inactive") {
      query = query.eq("is_active", false);
    }

    if (params.stock === "in_stock" || params.stock === "low_stock") {
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

    if (params.size) {
      query = query.eq("product_sizes.size", params.size);
    }

    // Сортировка
    if (params.sort === "name") {
      query = query.order("name", { ascending: params.order === "asc" });
    } else if (params.sort === "price") {
      query = query.order("drop_price", { ascending: params.order === "asc" });
    } else {
      query = query.order("created_at", { ascending: params.order === "asc" });
    }

    // Пагинация — для low_stock и фильтра недостач забираем все,
    // фильтруем/сортируем в JS (нужен агрегат из stock_reconciliations).
    const isLowStockFilter = params.stock === "low_stock";
    const isLossFilter = params.loss === "with_loss";
    const fetchAllForJsFilter = isLowStockFilter || isLossFilter;
    if (!fetchAllForJsFilter) {
      const from = (params.page - 1) * params.limit;
      const to = from + params.limit - 1;
      query = query.range(from, to);
    }

    const { data: products, error, count } = await query;

    if (error) {
      console.error("Products fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки товаров" }, { status: 500 });
    }

    // Получаем статистику продаж для товаров — канон §9.3/§9.4:
    //  – выручка считается по «живым» статусам (paid/collecting/sent +
    //    return/trash/problem + return_done с bad_quality);
    //  – для партнёрских заказов выручка = partner_commission_snapshot,
    //    для своих = client_price (хелпер ownerRevenue);
    //  – `sold` = число заказов в этих же статусах (а не только sent).
    const productIds = products?.map((p) => p.id) || [];
    const { data: salesData } = await supabase
      .from("orders")
      .select(
        "product_id, client_price, partner_id, partner_commission_snapshot, status, fault_reason"
      )
      .in("product_id", productIds);

    const salesStats: Record<string, { sold: number; revenue: number }> = {};
    salesData?.forEach((order) => {
      const pid = order.product_id;
      if (!pid) return;
      if (!isRevenueCounted(order.status ?? "", order.fault_reason)) return;
      if (!salesStats[pid]) salesStats[pid] = { sold: 0, revenue: 0 };
      salesStats[pid].sold += 1;
      salesStats[pid].revenue += ownerRevenue(order);
    });

    // Недостачи: агрегат из stock_reconciliations по товарам (единая
    // формула — хелпер aggregateLossByProduct, см. lib/stock/loss.ts).
    let lossByProduct = new Map<string, { units: number; rub: number; surplus: number }>();
    if (productIds.length > 0) {
      const { data: reconRows } = await supabase
        .from("stock_reconciliations")
        .select("product_id, delta, purchase_price_snapshot")
        .in("product_id", productIds);
      lossByProduct = aggregateLossByProduct(reconRows ?? []);
    }

    // Живая обложка для меню товаров: если у товара есть загруженная «Живая
    // обложка» (avito_media_presets kind='preview') — она В ПРИОРИТЕТЕ над
    // photo_urls[0]. Единый хелпер getLiveCoverMap — тот же источник аватарки,
    // что и в карточке товара и модалке «Создать объявление».
    const liveCoverByProduct = await getLiveCoverMap(supabase, productIds);

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
        category: product.category,
        purchasePrice: product.purchase_price,
        dropPrice: product.drop_price,
        recommendedPrice: product.recommended_price,
        photoUrl: liveCoverByProduct.get(product.id) ?? product.photo_urls?.[0] ?? null,
        isActive: product.is_active,
        isPremium: product.is_premium,
        isInStock: product.is_in_stock,
        expectedArrivalDate: product.expected_arrival_date,
        createdAt: product.created_at,
        sizes: sortSizeEntries(sizes).map((s) => ({
          size: s.size,
          current: s.current_quantity,
          initial: s.initial_quantity,
        })),
        totalStock,
        totalInitial,
        sales: salesStats[product.id] || { sold: 0, revenue: 0 },
        loss: lossByProduct.get(product.id) ?? { units: 0, rub: 0, surplus: 0 },
      };
    });

    // Пост-фильтрация для low_stock: остаток <= 20% от начального
    let finalProducts = productsWithStats || [];
    let finalTotal = count || 0;
    if (isLowStockFilter) {
      finalProducts = finalProducts.filter(
        (p) => p.totalInitial > 0 && p.totalStock > 0 && p.totalStock / p.totalInitial <= 0.2
      );
      finalTotal = finalProducts.length;
      const from = (params.page - 1) * params.limit;
      finalProducts = finalProducts.slice(from, from + params.limit);
    }
    if (isLossFilter) {
      finalProducts = finalProducts
        .filter((p) => p.loss.units > 0)
        .sort((a, b) => b.loss.units - a.loss.units);
      finalTotal = finalProducts.length;
      const from = (params.page - 1) * params.limit;
      finalProducts = finalProducts.slice(from, from + params.limit);
    }

    // Общая статистика (single-tenant — все products).
    const statsQuery = supabase
      .from("products")
      .select("id, is_active, is_in_stock, expected_arrival_date, deleted_at");
    const { data: allProductsStats } = await statsQuery;

    const statsRows = allProductsStats ?? [];
    const summary = {
      total: statsRows.length,
      active: statsRows.filter((p) => p.is_active && !p.deleted_at).length,
      inStock: statsRows.filter((p) => p.is_in_stock && !p.deleted_at).length,
      inTransit: statsRows.filter(
        (p) => !p.is_in_stock && !!p.expected_arrival_date && !p.deleted_at
      ).length,
      outOfStock: statsRows.filter(
        (p) => !p.is_in_stock && !p.expected_arrival_date && !p.deleted_at
      ).length,
      archived: statsRows.filter((p) => !p.is_active && !p.deleted_at).length,
      deleted: statsRows.filter((p) => !!p.deleted_at).length,
    };

    // Категории — фиксированный список (константа, не derive из БД:
    // иначе всплывали бы старые «хвосты»). Размеры — из данных.
    const { data: sizesData } = await supabase.from("product_sizes").select("size");

    const uniqueCategories = [...PRODUCT_CATEGORIES];
    const uniqueSizes = sortSizes(
      Array.from(new Set(sizesData?.map((s) => s.size))).filter(Boolean) as string[]
    );

    return NextResponse.json({
      products: finalProducts,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: finalTotal,
        totalPages: Math.ceil(finalTotal / params.limit),
      },
      summary,
      categories: uniqueCategories,
      sizes: uniqueSizes,
    });
  } catch (error) {
    console.error("Products API error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST - создание товара
const bindingSchema = z.object({
  partnerId: z.string().uuid(),
  warehouseKind: z.enum(["owner", "partner"]),
  commission: z.number().min(0).max(1_000_000),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1),
        currentQuantity: z.number().int().min(0),
      })
    )
    .default([]),
});

const createProductSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  category: z.enum(PRODUCT_CATEGORIES),
  description: z.string().optional(),
  purchasePrice: z.number().min(0, "Цена должна быть положительной"),
  dropPrice: z.number().min(0, "Цена должна быть положительной"),
  recommendedPrice: z.number().optional(),
  photoUrls: z.array(z.string()).optional(),
  isPremium: z.boolean().default(false),
  // isInStock убран: состояние стока вычисляется триггером из product_sizes.
  expectedArrivalDate: z.string().optional(),
  supplierId: z.string().optional(),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1),
        quantity: z.number().min(0),
        // Замеры пер-размер (см), поля зависят от категории (§11.6).
        measurements: z.record(z.string(), z.number()).optional(),
      })
    )
    .default([]),
  // Количество для режима one-size (когда sizes пустой). Игнорируется если sizes непустой.
  oneSizeQuantity: z.number().int().min(0).optional(),
  locationCity: z.string().trim().min(1, "Город обязателен").max(64),
  // Лестница привязок партнёров (новая модель). Порядок в массиве = priority 1..N.
  // Каждая привязка содержит свой сток per-размер.
  bindings: z.array(bindingSchema).default([]),
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

    // Атомарное создание товара через RPC create_product_with_sizes.
    // Для sizeless (sizes=[]) RPC сама создаст строку product_sizes 'One Size'
    // с quantity = purchase_quantity.
    const hasSizes = data.sizes.length > 0;
    const purchaseQty = hasSizes
      ? data.sizes.reduce((sum, s) => sum + s.quantity, 0)
      : (data.oneSizeQuantity ?? 0);

    // Валидация лестницы партнёров: уникальные partner_id, активные партнёры,
    // привязанные к боту (если warehouse=partner — нужны реквизиты).
    if (data.bindings.length > 0) {
      const partnerIds = data.bindings.map((b) => b.partnerId);
      const uniq = new Set(partnerIds);
      if (uniq.size !== partnerIds.length) {
        return NextResponse.json(
          { error: "Один партнёр указан в лестнице несколько раз" },
          { status: 400 }
        );
      }
      const { data: partners } = await supabase
        .from("partners")
        .select("id, is_active, tg_user_id, payment_requisites")
        .in("id", partnerIds);

      for (const b of data.bindings) {
        const p = (partners ?? []).find((x) => x.id === b.partnerId);
        if (!p || !p.is_active) {
          return NextResponse.json(
            { error: "Партнёр не найден или деактивирован" },
            { status: 400 }
          );
        }
        if (!p.tg_user_id) {
          return NextResponse.json(
            { error: "Партнёр ещё не привязан к Telegram-боту" },
            { status: 400 }
          );
        }
        if (b.warehouseKind === "partner" && !p.payment_requisites) {
          return NextResponse.json(
            { error: `У партнёра «${p.id}» нет реквизитов — он не сможет получать оплату` },
            { status: 400 }
          );
        }
      }
    }

    const productPayload = {
      name: data.name,
      category: data.category ?? null,
      description: data.description ?? null,
      purchase_price: data.purchasePrice,
      drop_price: data.dropPrice,
      recommended_price: data.recommendedPrice ?? null,
      photo_urls: data.photoUrls ?? [],
      is_premium: data.isPremium,
      is_active: true,
      expected_arrival_date: data.expectedArrivalDate || null,
      supplier_id: data.supplierId ?? null,
      location_city: data.locationCity,
      purchase_quantity: purchaseQty,
    };

    // Замеры пер-размер (§11.6) пробрасываем в RPC внутри элементов p_sizes.
    const sizesPayload =
      data.sizes.length === 0
        ? []
        : sortSizeEntries(
            data.sizes.map((s) => ({
              size: s.size,
              quantity: s.quantity,
              measurements: s.measurements ?? {},
            }))
          );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: productId, error: rpcError } = await (supabase.rpc as any)(
      "create_product_with_sizes",
      { p_product: productPayload, p_sizes: sizesPayload }
    );

    if (rpcError || !productId) {
      console.error("Product create RPC error:", rpcError);
      return NextResponse.json({ error: "Ошибка создания товара" }, { status: 500 });
    }

    // «Партия 1» — журнал закупок (§11.5). Снимок созданных размеров +
    // цена; пересчитывает «всего закуплено»/среднюю закупочную.
    const { error: batchError } = await supabase.rpc("create_first_batch", {
      p_product_id: productId as string,
      p_price: data.purchasePrice,
    });
    if (batchError) {
      console.error("create_first_batch error:", batchError);
      return NextResponse.json({ error: "Ошибка создания партии" }, { status: 500 });
    }

    // Создаём привязки партнёров + их стоки.
    if (data.bindings.length > 0) {
      const bindingRows = data.bindings.map((b, idx) => ({
        product_id: productId as string,
        partner_id: b.partnerId,
        priority: idx + 1,
        warehouse_kind: b.warehouseKind,
        commission: b.commission,
      }));
      const { data: insertedBindings, error: bindError } = await supabase
        .from("product_partner_bindings")
        .insert(bindingRows)
        .select("id, partner_id");
      if (bindError || !insertedBindings) {
        console.error("Bindings insert error:", bindError);
        return NextResponse.json({ error: "Ошибка создания привязок" }, { status: 500 });
      }

      const stockRows: Array<{
        binding_id: string;
        size: string;
        current_quantity: number;
      }> = [];
      for (const b of data.bindings) {
        const inserted = insertedBindings.find((x) => x.partner_id === b.partnerId);
        if (!inserted) continue;
        for (const s of b.sizes) {
          stockRows.push({
            binding_id: inserted.id,
            size: s.size,
            current_quantity: s.currentQuantity,
          });
        }
      }
      if (stockRows.length > 0) {
        const { error: stockError } = await supabase
          .from("product_partner_size_stock")
          .insert(stockRows);
        if (stockError) {
          console.error("Stock insert error:", stockError);
          return NextResponse.json({ error: "Ошибка стока партнёров" }, { status: 500 });
        }
      }
    }

    // Логируем
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "product_created",
      entity_type: "product",
      entity_id: productId,
      details: { name: data.name, bindingsCount: data.bindings.length },
    });

    return NextResponse.json({ success: true, productId });
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

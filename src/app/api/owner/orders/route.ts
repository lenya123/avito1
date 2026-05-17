import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

import { getOwnerSession } from "@/lib/auth/session";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z
    .enum([
      "all",
      "active",
      "completed",
      "problem",
      "returns",
      "awaiting_shipment",
      "collecting",
      "in_transit",
      "return_in_transit",
      "return_arrived",
      "return_completed",
      "cancelled",
      "trash",
      "disposed",
    ])
    .default("all"),
  clientId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  deliveryService: z.enum(["all", "avito", "yandex", "cdek", "pochta", "5post"]).default("all"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(["created_at", "order_number", "client_price", "deadline"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      clientId: searchParams.get("clientId") ?? undefined,
      productId: searchParams.get("productId") ?? undefined,
      deliveryService: searchParams.get("deliveryService") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });

    const supabase = createServiceClient();

    // Базовый запрос
    let query = supabase.from("orders").select(
      `
        id,
        order_number,
        status,
        client_price,
        purchase_price,
        sale_price,
        delivery_service,
        delivery_deadline,
        tracking_number,
        pickup_point_id,
        client_comment,
        created_at,
        updated_at,
        size,
        client_id,
        product_id
      `,
      { count: "exact" }
    );

    // Фильтр по статусу
    if (params.status === "active") {
      query = query.in("status", ["awaiting_shipment", "collecting", "in_transit", "problem"]);
    } else if (params.status === "completed") {
      query = query.eq("status", "completed");
    } else if (params.status === "problem") {
      query = query.eq("status", "problem");
    } else if (params.status === "returns") {
      query = query.in("status", ["return_in_transit", "return_arrived", "return_completed"]);
    } else if (params.status !== "all") {
      query = query.eq("status", params.status);
    }

    // Фильтр по клиенту
    if (params.clientId) {
      query = query.eq("client_id", params.clientId);
    }

    // Фильтр по товару
    if (params.productId) {
      query = query.eq("product_id", params.productId);
    }

    // Фильтр по службе доставки
    if (params.deliveryService !== "all") {
      query = query.eq("delivery_service", params.deliveryService);
    }

    // Фильтр по дате
    if (params.dateFrom) {
      query = query.gte("created_at", params.dateFrom);
    }
    if (params.dateTo) {
      query = query.lte("created_at", params.dateTo);
    }

    // Поиск
    if (params.search) {
      const searchNum = parseInt(params.search);
      if (!isNaN(searchNum)) {
        query = query.eq("order_number", searchNum);
      } else {
        query = query.ilike("tracking_number", `%${params.search}%`);
      }
    }

    // Сортировка
    query = query.order(params.sort, { ascending: params.order === "asc" });

    // Пагинация
    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;
    query = query.range(from, to);

    const { data: orders, error, count } = await query;

    if (error) {
      console.error("Orders fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки заказов" }, { status: 500 });
    }

    // Получаем данные о клиентах и товарах
    const clientIds = Array.from(new Set(orders?.map((o) => o.client_id) || []));
    const productIds = Array.from(
      new Set(orders?.map((o) => o.product_id).filter(Boolean) || [])
    ) as string[];

    const { data: clients } = await supabase
      .from("users")
      .select("id, telegram_username, name")
      .in("id", clientIds);

    const { data: products } = await supabase
      .from("products")
      .select("id, name, photo_urls")
      .in("id", productIds);

    const clientsMap = new Map(clients?.map((c) => [c.id, c]) || []);
    const productsMap = new Map(products?.map((p) => [p.id, p]) || []);

    // Формируем ответ
    const ordersFormatted = orders?.map((order) => {
      const client = clientsMap.get(order.client_id);
      const product = order.product_id ? productsMap.get(order.product_id) : null;

      return {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        clientPrice: order.client_price,
        purchasePrice: order.purchase_price,
        salePrice: order.sale_price,
        size: order.size,
        deliveryService: order.delivery_service,
        deliveryDeadline: order.delivery_deadline,
        trackingNumber: order.tracking_number,
        pickupPointId: order.pickup_point_id,
        comment: order.client_comment,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        client: client
          ? {
              id: client.id,
              username: client.telegram_username,
              name: client.name,
            }
          : null,
        product: product
          ? {
              id: product.id,
              name: product.name,
              photo: product.photo_urls?.[0] || null,
            }
          : null,
      };
    });

    // Статистика по текущему фильтру (используем данные из текущей страницы + count из основного запроса)
    // Для точной суммы по всему фильтру — делаем отдельный запрос с теми же фильтрами
    let statsQuery = supabase.from("orders").select("client_price, purchase_price, sale_price");

    // Применяем те же фильтры
    if (params.status === "active") {
      statsQuery = statsQuery.in("status", [
        "awaiting_shipment",
        "collecting",
        "in_transit",
        "problem",
      ]);
    } else if (params.status === "completed") {
      statsQuery = statsQuery.eq("status", "completed");
    } else if (params.status === "problem") {
      statsQuery = statsQuery.eq("status", "problem");
    } else if (params.status === "returns") {
      statsQuery = statsQuery.in("status", [
        "return_in_transit",
        "return_arrived",
        "return_completed",
      ]);
    } else if (params.status !== "all") {
      statsQuery = statsQuery.eq("status", params.status);
    }

    if (params.clientId) statsQuery = statsQuery.eq("client_id", params.clientId);
    if (params.productId) statsQuery = statsQuery.eq("product_id", params.productId);
    if (params.deliveryService !== "all")
      statsQuery = statsQuery.eq("delivery_service", params.deliveryService);
    if (params.dateFrom) statsQuery = statsQuery.gte("created_at", params.dateFrom);
    if (params.dateTo) statsQuery = statsQuery.lte("created_at", params.dateTo);

    if (params.search) {
      const searchNum = parseInt(params.search);
      if (!isNaN(searchNum)) {
        statsQuery = statsQuery.eq("order_number", searchNum);
      } else {
        statsQuery = statsQuery.ilike("tracking_number", `%${params.search}%`);
      }
    }

    const { data: statsData } = await statsQuery;

    const stats = {
      totalOrders: count || 0,
      totalRevenue: statsData?.reduce((sum, o) => sum + (o.client_price || 0), 0) || 0,
      totalProfit:
        statsData?.reduce((sum, o) => sum + ((o.client_price || 0) - (o.purchase_price || 0)), 0) ||
        0,
    };

    return NextResponse.json({
      orders: ordersFormatted,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / params.limit),
      },
      stats,
    });
  } catch (error) {
    console.error("Orders API error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

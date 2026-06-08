import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { OrderListItem, OrdersListResponse } from "@/hooks/use-owner-orders";
import { aggregateOwnerFinance, ownerProfit } from "@/lib/finance/owner-revenue";

type Client = SupabaseClient<Database>;

export interface OrdersServiceFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  /** Filter by customer_id (historically called clientId in UI). */
  clientId?: string;
  productId?: string;
  deliveryService?: string;
  /** Фильтр по оплате: all (все) | paid (is_paid=true) | debt (+ВАЙБ в долг, is_paid=false). */
  payment?: string;
  /** Фильтр по источнику: all | owner (partner_id IS NULL) | partner (partner_id NOT NULL). */
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "created_at" | "order_number" | "client_price" | "deadline";
  order?: "asc" | "desc";
}

interface ListOrdersOpts {
  supabase: Client;
  filters: OrdersServiceFilters;
}

const DEFAULT_LIMIT = 20;

type StatusFilterable = {
  in: (column: string, values: readonly string[]) => StatusFilterable;
  eq: (column: string, value: string) => StatusFilterable;
};

// Канон §4.2 + §15 (Avito): paid → collecting → sent → delivered (Avito),
// return → return_in_transit → return_done.
function applyStatusFilter<T extends StatusFilterable>(q: T, status: string | undefined): T {
  if (!status || status === "all") return q;
  if (status === "active") {
    // Avito awaiting_size — тоже активный (заказ есть, ждём размера).
    return q.in("status", ["paid", "collecting", "problem", "awaiting_size"]) as T;
  }
  if (status === "returns") {
    return q.in("status", ["return", "return_done", "return_in_transit"]) as T;
  }
  return q.eq("status", status) as T;
}

type OrderFilterable = StatusFilterable & {
  eq: (column: string, value: string | number | boolean) => OrderFilterable;
  gte: (column: string, value: string) => OrderFilterable;
  lte: (column: string, value: string) => OrderFilterable;
  ilike: (column: string, pattern: string) => OrderFilterable;
  is: (column: string, value: null) => OrderFilterable;
  not: (column: string, op: string, value: null) => OrderFilterable;
};

/**
 * Единый набор фильтров списка заказов (статус/клиент/товар/служба/даты/
 * поиск). Используется и в `listOrders` (страница «Заказы»), и в
 * экспорте — экспорт выгружает ровно то, что отфильтровано на экране.
 * Сортировка/пагинация — на стороне вызывающего (у экспорта своя).
 */
export function applyOrderFilters<T extends OrderFilterable>(
  q: T,
  filters: OrdersServiceFilters
): T {
  let query = applyStatusFilter(q as StatusFilterable, filters.status) as T;
  if (filters.clientId) query = query.eq("customer_id", filters.clientId) as T;
  if (filters.productId) query = query.eq("product_id", filters.productId) as T;
  if (filters.deliveryService && filters.deliveryService !== "all") {
    query = query.eq("delivery_service", filters.deliveryService) as T;
  }
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom) as T;
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo) as T;
  if (filters.payment === "paid") query = query.eq("is_paid", true) as T;
  else if (filters.payment === "debt") query = query.eq("is_paid", false) as T;
  if (filters.source === "owner") query = query.is("partner_id", null) as T;
  else if (filters.source === "partner") query = query.not("partner_id", "is", null) as T;
  // ТЗ §15: разделение Дроп vs Avito по orders.source.
  else if (filters.source === "avito") query = query.eq("source", "avito") as T;
  else if (filters.source === "drop") query = query.eq("source", "drop") as T;
  if (filters.search) {
    const searchNum = parseInt(filters.search, 10);
    if (!isNaN(searchNum)) {
      query = query.eq("order_number", searchNum) as T;
    } else {
      query = query.ilike("tracking_number", `%${filters.search}%`) as T;
    }
  }
  return query;
}

export async function listOrders({
  supabase,
  filters,
}: ListOrdersOpts): Promise<OrdersListResponse> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? DEFAULT_LIMIT;
  const sort = filters.sort ?? "created_at";
  const order = filters.order ?? "desc";

  let query = supabase.from("orders").select(
    `
      id,
      order_number,
      status,
      fault_reason,
      client_price,
      purchase_price,
      sale_price,
      shipper_rate_snapshot,
      partner_id,
      partner_commission_snapshot,
      delivery_service,
      send_by,
      tracking_number,
      pickup_point_id,
      client_comment,
      created_at,
      updated_at,
      size,
      source,
      avito_order_id,
      customer_id,
      customer_name_snapshot,
      customer_tg_username_snapshot,
      product_id
    `,
    { count: "exact" }
  );

  query = applyOrderFilters(query, filters);

  query = query.order(sort, { ascending: order === "asc" });

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data: orders, error, count } = await query;

  if (error) {
    throw new Error(`Orders fetch error: ${error.message}`);
  }

  const customerIds = Array.from(new Set(orders?.map((o) => o.customer_id) || [])).filter(
    (v): v is string => !!v
  );
  const productIds = Array.from(
    new Set(orders?.map((o) => o.product_id).filter(Boolean) || [])
  ) as string[];

  const [customersResult, productsResult] = await Promise.all([
    customerIds.length > 0
      ? supabase.from("customers").select("id, telegram_username, name").in("id", customerIds)
      : Promise.resolve({ data: [] }),
    productIds.length > 0
      ? supabase.from("products").select("id, name, photo_urls").in("id", productIds)
      : Promise.resolve({ data: [] }),
  ]);

  const customersMap = new Map((customersResult.data || []).map((c) => [c.id, c]));
  const productsMap = new Map((productsResult.data || []).map((p) => [p.id, p]));

  // Avito-заказы без привязанного товара: подтягиваем item_title/img из avito_orders
  // (название НЕ дублируется в orders), чтобы карточка показывала товар, а не
  // «Товар удалён» — объявление можно было удалить, но название заказа осталось.
  const avitoOrderIds = Array.from(
    new Set(
      (orders || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((o: any) => o.source === "avito" && !o.product_id && o.avito_order_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((o: any) => o.avito_order_id)
    )
  ) as string[];
  const avitoItemsResult =
    avitoOrderIds.length > 0
      ? await supabase
          .from("avito_orders")
          .select("avito_order_id, item_title, item_img_url")
          .in("avito_order_id", avitoOrderIds)
      : { data: [] as { avito_order_id: string; item_title: string | null; item_img_url: string | null }[] };
  const avitoItemsMap = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((avitoItemsResult.data as any[]) || []).map((a) => [a.avito_order_id, a])
  );

  const ordersFormatted: OrderListItem[] =
    orders?.map((o) => {
      const customer = o.customer_id ? customersMap.get(o.customer_id) : null;
      const product = o.product_id ? productsMap.get(o.product_id) : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avitoItem = (o as any).avito_order_id ? avitoItemsMap.get((o as any).avito_order_id) : null;
      return {
        id: o.id,
        orderNumber: o.order_number,
        status: o.status as string,
        source: (o.source as string | null) ?? null,
        clientPrice: o.client_price ?? 0,
        purchasePrice: o.purchase_price ?? 0,
        // Прибыль по канону §9.4 (свой = client−purchase−shipper_rate;
        // партнёрский = комиссия; гейт по §9.3). Считаем на сервере —
        // карточка показывает уже корректное значение.
        profit: ownerProfit({
          status: o.status,
          fault_reason: o.fault_reason,
          client_price: o.client_price,
          purchase_price: o.purchase_price,
          shipper_rate_snapshot: o.shipper_rate_snapshot,
          partner_id: o.partner_id,
          partner_commission_snapshot: o.partner_commission_snapshot,
        }),
        salePrice: o.sale_price,
        size: o.size ?? "",
        deliveryService: o.delivery_service,
        sendBy: o.send_by,
        trackingNumber: o.tracking_number,
        pickupPointId: o.pickup_point_id,
        comment: o.client_comment,
        createdAt: o.created_at ?? "",
        updatedAt: o.updated_at ?? "",
        client: customer
          ? {
              id: customer.id,
              username: customer.telegram_username,
              name: customer.name,
            }
          : o.customer_name_snapshot || o.customer_tg_username_snapshot
            ? {
                id: "",
                username: o.customer_tg_username_snapshot,
                name: o.customer_name_snapshot,
              }
            : null,
        product: product
          ? {
              id: product.id,
              name: product.name,
              photo: product.photo_urls?.[0] || null,
            }
          : avitoItem?.item_title
            ? {
                // Фолбэк для Avito-заказа без привязки к товару каталога.
                id: "",
                name: avitoItem.item_title,
                photo: avitoItem.item_img_url || null,
              }
            : null,
      };
    }) || [];

  // Stats: same filters without pagination
  let statsQuery = supabase
    .from("orders")
    .select(
      "status, fault_reason, client_price, purchase_price, sale_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot"
    );
  statsQuery = applyStatusFilter(statsQuery, filters.status);
  if (filters.clientId) statsQuery = statsQuery.eq("customer_id", filters.clientId);
  if (filters.productId) statsQuery = statsQuery.eq("product_id", filters.productId);
  if (filters.deliveryService && filters.deliveryService !== "all") {
    statsQuery = statsQuery.eq("delivery_service", filters.deliveryService);
  }
  if (filters.dateFrom) statsQuery = statsQuery.gte("created_at", filters.dateFrom);
  if (filters.dateTo) statsQuery = statsQuery.lte("created_at", filters.dateTo);
  if (filters.search) {
    const searchNum = parseInt(filters.search, 10);
    if (!isNaN(searchNum)) {
      statsQuery = statsQuery.eq("order_number", searchNum);
    } else {
      statsQuery = statsQuery.ilike("tracking_number", `%${filters.search}%`);
    }
  }

  const { data: statsData } = await statsQuery;
  // Единый канон §9.3/§9.4 (гейт по статусу + партнёр = комиссия +
  // вычет ставки отправщика) — тот же хелпер, что на всех экранах.
  const fin = aggregateOwnerFinance(statsData ?? []);
  const stats = {
    totalOrders: count || 0,
    totalRevenue: fin.revenue,
    totalProfit: fin.profit,
  };

  return {
    orders: ordersFormatted,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
    stats,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

import { getOwnerSession } from "@/lib/auth/session";
import { listOrders } from "@/lib/services/orders";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  // Канон §4.2 + virtual-фильтры: all/active/returns. §15 — Avito-only:
  // awaiting_size / delivered / return_in_transit.
  status: z
    .enum([
      "all",
      "active",
      "returns",
      "paid",
      "collecting",
      "sent",
      "return",
      "return_done",
      "problem",
      "cancelled",
      "trash",
      "awaiting_size",
      "delivered",
      "return_in_transit",
    ])
    .default("all"),
  clientId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  deliveryService: z.enum(["all", "avito", "yandex", "cdek", "pochta", "5post"]).default("all"),
  payment: z.enum(["all", "paid", "debt"]).default("all"),
  // Канон §15: source включает 'avito' как первоклассный канал.
  source: z.enum(["all", "owner", "partner", "avito", "drop"]).default("all"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(["created_at", "order_number", "client_price", "deadline"]).default("created_at"),
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
      clientId: searchParams.get("clientId") ?? undefined,
      productId: searchParams.get("productId") ?? undefined,
      deliveryService: searchParams.get("deliveryService") ?? undefined,
      payment: searchParams.get("payment") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });

    const supabase = createServiceClient();

    const data = await listOrders({
      supabase,
      filters: {
        page: params.page,
        limit: params.limit,
        search: params.search,
        status: params.status,
        clientId: params.clientId,
        productId: params.productId,
        deliveryService: params.deliveryService,
        payment: params.payment,
        source: params.source,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        sort: params.sort,
        order: params.order,
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      "Owner orders API error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

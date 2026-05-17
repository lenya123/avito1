import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";

const HISTORY_STATUSES = ["completed", "return_completed", "cancelled", "disposed", "trash"];

const querySchema = z.object({
  status: z
    .enum([
      "awaiting_shipment",
      "collecting",
      "problem",
      "in_transit",
      "delivered_to_point",
      "completed",
      "not_picked_up",
      "return_arrived",
      "return_completed",
      "cancelled",
      "disposed",
      "trash",
    ])
    .optional(),
  statuses: z.string().optional(),
  delivery_service: z.string().optional(),
  pickup_point_id: z.string().uuid().optional(),
  urgent: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      status: searchParams.get("status") || undefined,
      statuses: searchParams.get("statuses") || undefined,
      delivery_service: searchParams.get("delivery_service") || undefined,
      pickup_point_id: searchParams.get("pickup_point_id") || undefined,
      urgent: searchParams.get("urgent") || undefined,
      search: searchParams.get("search") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    });

    const supabase = createServiceClient();

    // Determine if this is a history query (for sorting & pagination)
    const statusList = params.statuses?.split(",").filter(Boolean) || [];
    const isHistoryQuery =
      statusList.length > 0 && statusList.every((s) => HISTORY_STATUSES.includes(s));

    let query = supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        size,
        status,
        delivery_service,
        delivery_deadline,
        tracking_number,
        avito_order_id,
        barcode_printed,
        barcode_image_url,
        problem_type,
        linked_return_order_id,
        client_comment,
        system_comment,
        return_code,
        return_code_updated_at,
        source,
        shipped_at,
        updated_at,
        created_at,
        product:products (
          id,
          name,
          photo_urls
        ),
        client:users!orders_client_id_fkey (
          id,
          telegram_username
        ),
        pickup_point:pickup_points (
          id,
          address,
          delivery_service
        )
      `,
        { count: isHistoryQuery ? "exact" : undefined }
      )
      .order(isHistoryQuery ? "updated_at" : "delivery_deadline", { ascending: !isHistoryQuery });

    // Фильтры
    if (params.statuses) {
      // Множественный фильтр: statuses=in_transit,delivered_to_point,completed
      const statusList = params.statuses.split(",").filter(Boolean);
      query = query.in("status", statusList);
    } else if (params.status) {
      query = query.eq("status", params.status);
    } else {
      // По умолчанию — заказы для сборки, отправки и проблемные
      query = query.in("status", ["awaiting_shipment", "collecting", "problem"]);
    }

    if (params.delivery_service) {
      query = query.eq("delivery_service", params.delivery_service);
    }

    if (params.pickup_point_id) {
      query = query.eq("pickup_point_id", params.pickup_point_id);
    }

    if (params.urgent === "true") {
      const today = new Date().toISOString().split("T")[0];
      query = query.lte("delivery_deadline", today);
    }

    if (params.search) {
      const searchTerm = params.search.trim();
      // Search by order number (exact) or tracking number (ilike)
      const isNumeric = /^\d+$/.test(searchTerm);
      if (isNumeric) {
        query = query.or(`order_number.eq.${searchTerm},tracking_number.ilike.%${searchTerm}%`);
      } else {
        query = query.ilike("tracking_number", `%${searchTerm}%`);
      }
    }

    // Pagination for history
    if (isHistoryQuery) {
      const limit = params.limit || 50;
      const offset = params.offset || 0;
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Orders fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    // Группируем по срочности
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = data.map((order) => {
      const deadline = new Date(order.delivery_deadline);
      deadline.setHours(0, 0, 0, 0);
      return {
        ...order,
        isUrgent: deadline <= today,
      };
    });

    return NextResponse.json({
      orders,
      ...(isHistoryQuery && { total: count ?? orders.length }),
    });
  } catch (error) {
    console.error("Shipper orders error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

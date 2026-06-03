import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";

const HISTORY_STATUSES = ["sent", "return_done", "cancelled", "trash"];

const querySchema = z.object({
  status: z
    .enum(["paid", "collecting", "sent", "return", "return_done", "problem", "cancelled", "trash"])
    .optional(),
  statuses: z.string().optional(),
  delivery_service: z.string().optional(),
  pickup_point_id: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      status: searchParams.get("status") || undefined,
      statuses: searchParams.get("statuses") || undefined,
      delivery_service: searchParams.get("delivery_service") || undefined,
      pickup_point_id: searchParams.get("pickup_point_id") || undefined,
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
        send_by,
        pickup_by,
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
        customer_name_snapshot,
        customer_tg_username_snapshot,
        product:products (
          id,
          name,
          photo_urls
        ),
        source_partner_id,
        partner:partners!source_partner_id (
          id,
          name
        ),
        pickup_point_label_snapshot,
        pickup_point_address_snapshot
      `,
        { count: isHistoryQuery ? "exact" : undefined }
      )
      .order(isHistoryQuery ? "updated_at" : "send_by", { ascending: !isHistoryQuery });

    // Видимы только заказы где товар физически у владельца на складе:
    // source_warehouse='owner'. Это покрывает свои + партнёрские с
    // owner-warehouse (партнёр привёз товар к нам). Партнёрские с
    // partner-warehouse партнёр сам отгружает.
    query = query.eq("source_warehouse", "owner");

    // Фильтры
    if (params.statuses) {
      // Множественный фильтр: statuses=in_transit,delivered_to_point,completed
      const statusList = params.statuses.split(",").filter(Boolean);
      query = query.in("status", statusList);
    } else if (params.status) {
      query = query.eq("status", params.status);
    } else {
      // По умолчанию — активные «рабочие» статусы (BUSINESS_LOGIC §4.4):
      // общий пул paid + problem (для всех) + collecting/return
      // (свои закреплённые).
      query = query
        .in("status", ["paid", "collecting", "return", "problem"])
        .or(`claimed_by.is.null,claimed_by.eq.${session.userId}`);
    }

    if (params.delivery_service) {
      query = query.eq("delivery_service", params.delivery_service);
    }

    if (params.pickup_point_id) {
      query = query.eq("pickup_point_id", params.pickup_point_id);
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

    // Срочность: «Срочно» = за день до дедлайна и позже (дедлайн ≤ завтра).
    // Дедлайн зависит от стадии: для возврата это pickup_by (после него
    // возврат уходит в trash, §6.5), для остальных — send_by (дедлайн
    // отправки). send_by у возврата всегда в прошлом и для срочности
    // нерелевантен.
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orders = data.map((order) => {
      const deadlineRaw = order.status === "return" ? order.pickup_by : order.send_by;
      let isUrgent = false;
      if (deadlineRaw) {
        const deadline = new Date(deadlineRaw);
        deadline.setHours(0, 0, 0, 0);
        isUrgent = deadline <= tomorrow;
      }
      return {
        ...order,
        isUrgent,
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

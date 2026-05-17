import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET — список заказов Avito Доставка (из кеша в БД)
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({ orders: [], total: 0, hasMore: false });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { page, limit } = parsed.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = createServiceClient();

    const {
      data: orders,
      error,
      count,
    } = await supabase
      .from("avito_orders")
      .select("*", { count: "exact" })
      .eq("session_id", session.id)
      .order("created_at_avito", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[avito/orders GET] DB error:", error);
      return NextResponse.json({ error: "Ошибка загрузки заказов" }, { status: 500 });
    }

    const total = count ?? 0;

    return NextResponse.json({
      orders: orders ?? [],
      total,
      hasMore: to < total - 1,
    });
  } catch (error) {
    console.error("[avito/orders GET] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

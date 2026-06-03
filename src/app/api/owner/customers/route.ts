import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { ownerRevenue } from "@/lib/finance/owner-revenue";
import { z } from "zod";

// GET /api/owner/customers — список клиентов с фильтрами, пагинацией, агрегатами и summary.
// POST не делаем: клиенты появляются только через /start в customer-боте (Stage 3).

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  vibe: z.enum(["all", "enabled", "disabled"]).default("all"),
  frozen: z.enum(["all", "yes", "no"]).default("all"),
  blocked: z.enum(["all", "yes", "no"]).default("all"),
  sort: z.enum(["created_at", "orders", "revenue", "debt"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      vibe: searchParams.get("vibe") ?? undefined,
      frozen: searchParams.get("frozen") ?? undefined,
      blocked: searchParams.get("blocked") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });

    const supabase = createServiceClient();

    // Шаг 1: фильтруем/сортируем по customers-полям. Сортировки по агрегатам
    // (orders/revenue/debt) делаем в JS после обогащения — записей мало
    // (single-tenant), это дешевле чем materialized view.
    const isDbSortable = params.sort === "created_at";
    const serverOrder = isDbSortable ? params.order : "desc";

    let query = supabase
      .from("customers")
      .select(
        "id, tg_user_id, telegram_username, name, phone, vibe_enabled, vibe_credit_limit_override, is_frozen, frozen_at, is_blocked, blocked_reason, notes, created_at",
        { count: "exact" }
      );

    if (params.search) {
      query = query.or(
        `name.ilike.%${params.search}%,telegram_username.ilike.%${params.search}%,phone.ilike.%${params.search}%`
      );
    }
    if (params.vibe === "enabled") query = query.eq("vibe_enabled", true);
    if (params.vibe === "disabled") query = query.eq("vibe_enabled", false);
    if (params.frozen === "yes") query = query.eq("is_frozen", true);
    if (params.frozen === "no") query = query.eq("is_frozen", false);
    if (params.blocked === "yes") query = query.eq("is_blocked", true);
    if (params.blocked === "no") query = query.eq("is_blocked", false);

    query = query.order("created_at", { ascending: serverOrder === "asc" });

    // При JS-сортировке берём всех, чтобы верхний N-й не зависел от страницы.
    // Для single-tenant объём клиентов в сотнях/единицах тысяч — приемлемо.
    if (isDbSortable) {
      const from = (params.page - 1) * params.limit;
      query = query.range(from, from + params.limit - 1);
    }

    const { data: rows, error, count } = await query;

    if (error) {
      console.error("Customers list error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    const customers = rows || [];
    const ids = customers.map((c) => c.id);

    // Шаг 2: агрегаты (долг + количество/выручка заказов).
    const [{ data: debtRows }, { data: orderRows }, { data: bs }, { data: summary }] =
      await Promise.all([
        ids.length > 0
          ? supabase.from("customer_vibe_debt").select("customer_id, debt").in("customer_id", ids)
          : Promise.resolve({ data: [] as Array<{ customer_id: string; debt: number }> }),
        ids.length > 0
          ? supabase
              .from("orders")
              .select(
                "customer_id, client_price, status, fault_reason, partner_id, partner_commission_snapshot"
              )
              .in("customer_id", ids)
          : Promise.resolve({
              data: [] as Array<{
                customer_id: string | null;
                client_price: number;
                status: string;
                fault_reason: string | null;
                partner_id: string | null;
                partner_commission_snapshot: number | null;
              }>,
            }),
        supabase
          .from("business_settings")
          .select("vibe_credit_default_limit")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("customers")
          .select(
            "vibe_enabled.count(), is_frozen.count(), is_blocked.count()"
            // supabase-js <2.40 не поддерживает aggregate-синтаксис — fallback ниже.
          )
          .limit(1)
          .maybeSingle()
          .then(
            () =>
              ({
                data: null,
              }) as { data: null }
          ),
      ]);

    void summary; // fallback — считаем в JS

    const debtMap = new Map((debtRows || []).map((d) => [d.customer_id, Number(d.debt) || 0]));

    const statsMap = new Map<string, { orders: number; revenue: number }>();
    for (const o of orderRows || []) {
      if (!o.customer_id) continue;
      const s = statsMap.get(o.customer_id) || { orders: 0, revenue: 0 };
      // Выручка — единый канон §9.3/§9.4 (гейт по статусу + партнёрский
      // = комиссия). Было: только «sent» по client_price (занижало,
      // нулило клиентов без sent-заказов).
      s.orders += 1;
      s.revenue += ownerRevenue({
        status: o.status,
        fault_reason: o.fault_reason,
        client_price: o.client_price,
        partner_id: o.partner_id,
        partner_commission_snapshot: o.partner_commission_snapshot,
      });
      statsMap.set(o.customer_id, s);
    }

    const defaultLimit = Number(bs?.vibe_credit_default_limit ?? 0);

    const enriched = customers.map((c) => ({
      id: c.id,
      tgUserId: c.tg_user_id,
      telegramUsername: c.telegram_username,
      name: c.name,
      phone: c.phone,
      vibeEnabled: c.vibe_enabled,
      vibeLimit:
        c.vibe_credit_limit_override != null ? Number(c.vibe_credit_limit_override) : defaultLimit,
      isFrozen: c.is_frozen,
      frozenAt: c.frozen_at,
      isBlocked: c.is_blocked,
      blockedReason: c.blocked_reason,
      notes: c.notes,
      createdAt: c.created_at,
      debt: debtMap.get(c.id) ?? 0,
      stats: statsMap.get(c.id) ?? { orders: 0, revenue: 0 },
    }));

    // Шаг 3: JS-сортировка по агрегатам (если не created_at).
    if (!isDbSortable) {
      const key = params.sort as "orders" | "revenue" | "debt";
      const dir = params.order === "asc" ? 1 : -1;
      enriched.sort((a, b) => {
        const av = key === "orders" ? a.stats.orders : key === "revenue" ? a.stats.revenue : a.debt;
        const bv = key === "orders" ? b.stats.orders : key === "revenue" ? b.stats.revenue : b.debt;
        return (av - bv) * dir;
      });
    }

    // Пагинация после JS-сортировки.
    const paginated = isDbSortable
      ? enriched
      : enriched.slice((params.page - 1) * params.limit, params.page * params.limit);

    // Summary — считаем отдельным запросом (fast: indexed partial counts).
    const [vibeCountRes, frozenCountRes, blockedCountRes, totalCountRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("vibe_enabled", true),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_frozen", true),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("is_blocked", true),
      supabase.from("customers").select("id", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      customers: paginated,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / params.limit),
      },
      summary: {
        total: totalCountRes.count ?? 0,
        vibeEnabled: vibeCountRes.count ?? 0,
        frozen: frozenCountRes.count ?? 0,
        blocked: blockedCountRes.count ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Customers API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

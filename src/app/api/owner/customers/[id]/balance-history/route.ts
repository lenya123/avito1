import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

// GET /api/owner/customers/[id]/balance-history?limit=50&offset=0
// Полная история движений customer_balance для модалки на странице клиента.
// На самой странице используется компактный balanceHistory(10) из main GET.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

    const supabase = createServiceClient();

    const { data, error, count } = await supabase
      .from("customer_balance_history")
      .select(
        "id, delta, balance_after, reason, note, created_at, order_id, withdrawal_request_id, actor_user_id, order:orders(order_number), actor:users(name, email)",
        { count: "exact" }
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("balance-history fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки истории" }, { status: 500 });
    }

    return NextResponse.json({
      items: (data ?? []).map((h) => {
        const order = h.order as { order_number: number } | null;
        const actor = h.actor as { name: string | null; email: string | null } | null;
        return {
          id: h.id,
          delta: Number(h.delta),
          balanceAfter: Number(h.balance_after),
          reason: h.reason,
          note: h.note,
          createdAt: h.created_at,
          orderId: h.order_id,
          orderNumber: order?.order_number ?? null,
          withdrawalRequestId: h.withdrawal_request_id,
          actorUserId: h.actor_user_id,
          actorName: actor?.name ?? actor?.email ?? null,
        };
      }),
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("balance-history API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

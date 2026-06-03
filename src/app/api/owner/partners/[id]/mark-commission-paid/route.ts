/**
 * POST /api/owner/partners/[id]/mark-commission-paid
 *
 * Владелец отмечает что получил комиссию от партнёра.
 * Body: { orderIds?: string[] } — если не задан, помечаются все
 * заказы партнёра с partner_payment_received_at IS NOT NULL AND
 * partner_commission_paid_at IS NULL.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  orderIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  let body: z.infer<typeof bodySchema> = {};
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    throw error;
  }

  const supabase = createServiceClient();

  let query = supabase
    .from("orders")
    .update({ partner_commission_paid_at: new Date().toISOString() })
    .eq("partner_id", id)
    .not("partner_payment_received_at", "is", null)
    .is("partner_commission_paid_at", null);

  if (body.orderIds && body.orderIds.length > 0) {
    query = query.in("id", body.orderIds);
  }

  const { error, count } = await query;
  if (error) {
    console.error("mark-commission-paid failed:", error);
    return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "partner_commission_paid",
    entity_type: "partner",
    entity_id: id,
    details: {
      order_ids: body.orderIds ?? null,
      count: count ?? null,
    },
  });

  return NextResponse.json({ success: true, updated: count ?? null });
}

/**
 * POST /api/owner/vibe-payments/[id]/reject
 *
 * Удаляет неподтверждённый +ВАЙБ-платёж и связи с заказами
 * (заказы остаются неоплаченными). Уведомляет клиента.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyCustomerVibePaymentNeedsReview } from "@/lib/telegram/notifications";

const bodySchema = z.object({
  reason: z.string().trim().max(300).optional(),
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

  const { data: payment, error } = await supabase
    .from("vibe_payments")
    .select("id, customer_id, amount, confirmed_at")
    .eq("id", id)
    .single();

  if (error || !payment) {
    return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
  }
  if (payment.confirmed_at) {
    return NextResponse.json({ error: "Платёж уже подтверждён" }, { status: 400 });
  }

  // Удаляем связи и платёж (orders.is_paid не трогаем — он и так FALSE).
  await supabase.from("vibe_payment_orders").delete().eq("vibe_payment_id", id);
  const { error: deleteError } = await supabase.from("vibe_payments").delete().eq("id", id);
  if (deleteError) {
    console.error("vibe reject delete failed:", deleteError);
    return NextResponse.json({ error: "Не удалось отклонить" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "vibe_payment_reject",
    entity_type: "vibe_payment",
    entity_id: id,
    details: { reason: body.reason ?? null },
  });

  notifyCustomerVibePaymentNeedsReview({ customerId: payment.customer_id }).catch((e) =>
    console.error("notifyCustomerVibePaymentNeedsReview failed:", e)
  );

  return NextResponse.json({ success: true });
}

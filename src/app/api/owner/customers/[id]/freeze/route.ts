/**
 * POST /api/owner/customers/[id]/freeze
 *
 * Ручная заморозка клиента владельцем с указанием требуемой суммы.
 * Body: { requiredPaymentAmount?: number | null, reason?: string }.
 * Клиент получает уведомление через customer-bot.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyCustomerVibeFrozen } from "@/lib/telegram/notifications";

const bodySchema = z.object({
  requiredPaymentAmount: z.number().positive().max(10_000_000).nullable().optional(),
  reason: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    throw error;
  }

  const supabase = createServiceClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, vibe_enabled")
    .eq("id", id)
    .single();

  if (error || !customer) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }
  if (!customer.vibe_enabled) {
    return NextResponse.json(
      { error: "Заморозка применяется только к +ВАЙБ-клиентам" },
      { status: 400 }
    );
  }

  // Снимок долга на момент заморозки. Триггер check_vibe_credit_freeze
  // размораживает когда (snapshot - current_debt) >= required_payment_amount.
  const { data: debtRow } = await supabase
    .from("customer_vibe_debt")
    .select("debt")
    .eq("customer_id", id)
    .maybeSingle();
  const currentDebt = Number(debtRow?.debt ?? 0);

  const { error: updateError } = await supabase
    .from("customers")
    .update({
      is_frozen: true,
      frozen_at: new Date().toISOString(),
      required_payment_amount: body.requiredPaymentAmount ?? null,
      frozen_reason: "manual",
      frozen_debt_snapshot: currentDebt,
    })
    .eq("id", id);

  if (updateError) {
    console.error("freeze update failed:", updateError);
    return NextResponse.json({ error: "Не удалось заморозить клиента" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "customer_freeze",
    entity_type: "customer",
    entity_id: id,
    details: {
      required_payment_amount: body.requiredPaymentAmount ?? null,
      reason: body.reason ?? null,
      debt_snapshot: currentDebt,
    },
  });

  notifyCustomerVibeFrozen({
    customerId: id,
    debt: currentDebt,
    required: body.requiredPaymentAmount ?? null,
  }).catch((e) => console.error("notifyCustomerVibeFrozen failed:", e));

  return NextResponse.json({ success: true });
}

/**
 * POST /api/owner/customers/[id]/unfreeze
 *
 * Ручная разморозка клиента владельцем. Обнуляет required_payment_amount
 * и frozen_reason. Клиент получает уведомление через customer-bot.
 */

import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyCustomerVibeUnfrozen } from "@/lib/telegram/notifications";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, is_frozen")
    .eq("id", id)
    .single();

  if (error || !customer) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("customers")
    .update({
      is_frozen: false,
      frozen_at: null,
      required_payment_amount: null,
      frozen_reason: null,
      frozen_debt_snapshot: null,
    })
    .eq("id", id);

  if (updateError) {
    console.error("unfreeze update failed:", updateError);
    return NextResponse.json({ error: "Не удалось разморозить" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "customer_unfreeze",
    entity_type: "customer",
    entity_id: id,
    details: {},
  });

  // Текущий долг для текста разморозки (cause='admin_manual').
  const { data: debtRow } = await supabase
    .from("customer_vibe_debt")
    .select("debt")
    .eq("customer_id", id)
    .maybeSingle();
  const debt = Number(debtRow?.debt ?? 0);

  notifyCustomerVibeUnfrozen({ customerId: id, cause: "admin_manual", debt }).catch((e) =>
    console.error("notifyCustomerVibeUnfrozen failed:", e)
  );

  return NextResponse.json({ success: true });
}

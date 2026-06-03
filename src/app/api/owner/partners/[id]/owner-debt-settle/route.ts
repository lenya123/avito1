/**
 * POST /api/owner/partners/[id]/owner-debt-settle — отметить долг партнёра
 * перед владельцем как погашенный (партнёр вернул деньги).
 * Body: { debtId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  debtId: z.string().uuid(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    throw error;
  }

  const supabase = createServiceClient();

  const { data: debt, error: fetchError } = await supabase
    .from("partner_owner_debts")
    .select("id, partner_id, amount, settled_at")
    .eq("id", body.debtId)
    .single();

  if (fetchError || !debt) {
    return NextResponse.json({ error: "Долг не найден" }, { status: 404 });
  }
  if (debt.partner_id !== id) {
    return NextResponse.json({ error: "Долг принадлежит другому партнёру" }, { status: 400 });
  }
  if (debt.settled_at) {
    return NextResponse.json({ error: "Долг уже отмечен погашенным" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("partner_owner_debts")
    .update({
      settled_at: new Date().toISOString(),
      settled_by: session.userId,
    })
    .eq("id", body.debtId);

  if (updateError) {
    console.error("debt settle failed:", updateError);
    return NextResponse.json({ error: "Не удалось отметить" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "partner_owner_debt_settle",
    entity_type: "partner",
    entity_id: id,
    details: { debtId: body.debtId, amount: Number(debt.amount) },
  });

  return NextResponse.json({ success: true });
}

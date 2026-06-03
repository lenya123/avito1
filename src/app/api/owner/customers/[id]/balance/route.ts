import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

const bodySchema = z.object({
  delta: z
    .number()
    .refine((n) => n !== 0, "Сумма не может быть нулевой")
    .refine((n) => Math.abs(n) <= 10_000_000, "Слишком большая сумма"),
  note: z.string().trim().min(1, "Комментарий обязателен").max(1000),
});

// POST /api/owner/customers/[id]/balance
// Ручная корректировка customer_balance (➕ Пополнить / ➖ Списать).
// delta > 0 → reason='manual_credit'; delta < 0 → reason='manual_debit'.
// Защита от минуса — на уровне БД (CHECK balance_after >= 0).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Невалидные данные" },
        { status: 400 }
      );
    }
    const { delta, note } = parsed.data;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("apply_manual_balance_adjustment", {
      p_customer_id: id,
      p_delta: delta,
      p_note: note,
      p_actor_user_id: session.userId,
    });

    if (error) {
      // 23514 — CHECK violation (balance ушёл бы в минус).
      // 22023 — invalid_parameter_value (delta=0 или пустой note).
      // P0002 — customer not found.
      if (error.code === "23514") {
        return NextResponse.json(
          { error: "Недостаточно средств на балансе клиента" },
          { status: 400 }
        );
      }
      if (error.code === "P0002") {
        return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
      }
      console.error("apply_manual_balance_adjustment RPC error:", error);
      return NextResponse.json({ error: "Ошибка операции с балансом" }, { status: 500 });
    }

    return NextResponse.json({ balanceAfter: Number(data ?? 0) });
  } catch (error) {
    console.error("balance POST API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

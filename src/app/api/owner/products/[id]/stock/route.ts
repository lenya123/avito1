import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";

/**
 * Явные действия владельца над остатком размера. Заменяет старое
 * поле-угадайку (одно число → replace_product_sizes). Канон §11.4.
 *
 *  restock   — «Пришла партия» (+qty): closed += qty, закуплено += qty.
 *  reconcile — «Поправить остаток» с признанием потери/излишка: qty =
 *              физфакт; reconcile_product_stock пишет недостачу (факт<
 *              система) либо излишек (факт>система) + current := факт.
 *  correct   — «Поправить остаток» как тихая поправка опечатки: qty =
 *              новое значение; ставим current, закуплено НЕ трогаем,
 *              событие недостачи НЕ пишем.
 */
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("restock"),
    sizeId: z.string().uuid(),
    qty: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("reconcile"),
    sizeId: z.string().uuid(),
    qty: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("correct"),
    sizeId: z.string().uuid(),
    qty: z.number().int().min(0),
  }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: productId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Некорректный запрос", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const supabase = createServiceClient();

    if (data.action === "restock") {
      const { error } = await supabase.rpc("restock_product_size", {
        p_product_id: productId,
        p_size_id: data.sizeId,
        p_qty: data.qty,
      });
      if (error) {
        console.error("restock_product_size error:", error);
        return NextResponse.json({ error: "Ошибка прихода" }, { status: 500 });
      }
    } else if (data.action === "reconcile") {
      // Та же атомарная сверка, что у отправщика. Владелец как
      // reconciled_by → в ленте событий видно, кто сверял.
      const { error } = await supabase.rpc("reconcile_product_stock", {
        p_product_id: productId,
        p_sizes: [{ size_id: data.sizeId, counted: data.qty }],
        p_by: session.userId,
      });
      if (error) {
        console.error("reconcile_product_stock (owner) error:", error);
        return NextResponse.json({ error: "Ошибка сверки" }, { status: 500 });
      }
    } else {
      const { error } = await supabase.rpc("correct_product_size_quantity", {
        p_product_id: productId,
        p_size_id: data.sizeId,
        p_qty: data.qty,
      });
      if (error) {
        console.error("correct_product_size_quantity error:", error);
        return NextResponse.json({ error: "Ошибка поправки" }, { status: 500 });
      }
    }

    // §11.1 фикс (#2): пополнение/сверка/поправка остатка владельцем
    // могла поднять qty с 0 → нужно разбудить висящие `problem`
    // (out_of_stock) заказы на этом размере. Раньше это делал только
    // путь возврата; ручной ресток оставлял problem-заказы висеть до
    // сгорания send_by. Handler сам no-op, если стока/заказов нет.
    try {
      const { scheduleAutoResumeProblem } = await import("@/lib/jobs");
      await scheduleAutoResumeProblem(data.sizeId).catch((e) =>
        console.error("[owner-stock] scheduleAutoResumeProblem failed:", e)
      );
    } catch (e) {
      console.error("[owner-stock] scheduleAutoResumeProblem import failed:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("owner product stock action error:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

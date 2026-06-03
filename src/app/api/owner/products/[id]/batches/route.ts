import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";

/**
 * Управление партиями закупок товара (журнал, §11.5). Все операции
 * атомарны (RPC): пересчитывают «всего закуплено» и средневзвешенную
 * закупочную, двигают остаток на дельту (не уходя в минус).
 *
 *  add    — новая партия: цена + размеры/количества. Остаток += .
 *  edit   — правка партии (цена/размеры). Остаток сдвигается на дельту.
 *  delete — удалить партию (нельзя единственную). Остаток -= её размеры.
 */
const sizeRow = z.object({
  size_id: z.string().uuid(),
  size: z.string().min(1).max(20),
  quantity: z.number().int().min(0),
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    price: z.number().min(0),
    sizes: z.array(sizeRow).min(1),
  }),
  z.object({
    action: z.literal("edit"),
    batchId: z.string().uuid(),
    price: z.number().min(0),
    sizes: z.array(sizeRow),
  }),
  z.object({
    action: z.literal("delete"),
    batchId: z.string().uuid(),
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

    if (data.action === "add") {
      const { error } = await supabase.rpc("add_product_batch", {
        p_product_id: productId,
        p_price: data.price,
        p_sizes: data.sizes,
      });
      if (error) {
        console.error("add_product_batch error:", error);
        return NextResponse.json({ error: "Ошибка добавления партии" }, { status: 500 });
      }
    } else if (data.action === "edit") {
      const { error } = await supabase.rpc("edit_product_batch", {
        p_batch_id: data.batchId,
        p_price: data.price,
        p_sizes: data.sizes,
      });
      if (error) {
        console.error("edit_product_batch error:", error);
        return NextResponse.json({ error: "Ошибка правки партии" }, { status: 500 });
      }
    } else {
      const { error } = await supabase.rpc("delete_product_batch", {
        p_batch_id: data.batchId,
      });
      if (error) {
        console.error("delete_product_batch error:", error);
        const msg = error.message?.includes("only batch")
          ? "Нельзя удалить единственную партию"
          : "Ошибка удаления партии";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // §11.1 фикс (#2): add/edit партии могли поднять остаток размера с 0
    // → будим висящие `problem` (out_of_stock) заказы. Handler no-op,
    // если стока/заказов нет. (delete обычно уменьшает остаток — пропуск.)
    if (data.action === "add" || data.action === "edit") {
      try {
        const { scheduleAutoResumeProblem } = await import("@/lib/jobs");
        for (const s of data.sizes) {
          await scheduleAutoResumeProblem(s.size_id).catch((e) =>
            console.error("[owner-batches] scheduleAutoResumeProblem failed:", e)
          );
        }
      } catch (e) {
        console.error("[owner-batches] scheduleAutoResumeProblem import failed:", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("product batches action error:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

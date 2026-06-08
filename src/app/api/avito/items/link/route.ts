import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { scheduleAvitoRequestSize } from "@/lib/jobs/queues";
import { z } from "zod";

const linkSchema = z.object({
  avito_item_id: z.number().int().positive(),
  product_id: z.string().uuid(),
});

const unlinkSchema = z.object({
  avito_item_id: z.number().int().positive(),
});

// POST — привязать avito item к продукту
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const params = linkSchema.parse(body);

    const supabase = createServiceClient();

    // Проверяем что avito item принадлежит пользователю
    const { data: item } = await supabase
      .from("avito_items")
      .select("id")
      .eq("user_id", userId)
      .eq("avito_item_id", params.avito_item_id)
      .single();

    if (!item) {
      return NextResponse.json({ error: "Объявление не найдено" }, { status: 404 });
    }

    // Проверяем что продукт существует
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", params.product_id)
      .single();

    if (!product) {
      return NextResponse.json({ error: "Продукт не найден" }, { status: 404 });
    }

    // Upsert маппинг
    const { error } = await supabase.from("avito_item_product_mapping").upsert(
      {
        user_id: userId,
        avito_item_id: params.avito_item_id,
        product_id: params.product_id,
        match_type: "manual",
        match_confidence: 1.0,
      },
      { onConflict: "user_id,avito_item_id" }
    );

    if (error) {
      console.error("Link error:", error);
      return NextResponse.json({ error: "Ошибка привязки" }, { status: 500 });
    }

    // ТЗ §3.2: уже созданные заказы этого объявления, висящие в awaiting_size без
    // привязки к товару — добиваем после привязки: проставляем product_id и
    // запускаем AI-уточнение размера (раньше после привязки AI не стартовал —
    // заказ навсегда оставался в awaiting_size). orders ↔ avito_orders по
    // avito_order_id; avito_item_id живёт на avito_orders.
    let triggered = 0;
    try {
      const { data: aoRows } = await supabase
        .from("avito_orders")
        .select("avito_order_id")
        // avito_orders.avito_item_id — text-колонка; приводим number→string.
        .eq("avito_item_id", String(params.avito_item_id));
      const aoIds = (aoRows ?? [])
        .map((r) => (r as { avito_order_id: string }).avito_order_id)
        .filter(Boolean);
      if (aoIds.length) {
        const { data: pending } = await supabase
          .from("orders")
          .select("id")
          .eq("source", "avito")
          .eq("status", "awaiting_size")
          .is("product_id", null)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .in("avito_order_id", aoIds as any);
        for (const o of (pending ?? []) as Array<{ id: string }>) {
          await supabase.from("orders").update({ product_id: params.product_id }).eq("id", o.id);
          await scheduleAvitoRequestSize(o.id);
          triggered++;
        }
      }
    } catch (e) {
      console.error("[avito/items/link] post-link AI trigger failed:", e);
    }

    return NextResponse.json({ success: true, sizeRequestTriggered: triggered });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Невалидные данные" }, { status: 400 });
    }
    console.error("Link error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// DELETE — отвязать avito item от продукта
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const params = unlinkSchema.parse(body);

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("avito_item_product_mapping")
      .delete()
      .eq("user_id", userId)
      .eq("avito_item_id", params.avito_item_id);

    if (error) {
      console.error("Unlink error:", error);
      return NextResponse.json({ error: "Ошибка отвязки" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Невалидные данные" }, { status: 400 });
    }
    console.error("Unlink error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
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
    const userId = getUserIdFromSession(request);
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

    return NextResponse.json({ success: true });
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
    const userId = getUserIdFromSession(request);
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

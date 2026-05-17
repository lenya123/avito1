import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

// Подписаться на уведомление о поступлении
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Проверяем, что товар действительно недоступен для заказа
    // (либо не в наличии, либо все размеры распроданы)
    const { data: product } = await supabase
      .from("products")
      .select(
        `
        is_in_stock,
        sizes:product_sizes(current_quantity, reserved_quantity)
      `
      )
      .eq("id", params.id)
      .single();

    if (!product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Проверяем есть ли доступные размеры
    const hasAvailableSizes = product.sizes?.some(
      (s: { current_quantity: number; reserved_quantity: number | null }) =>
        s.current_quantity > (s.reserved_quantity || 0)
    );

    // Товар доступен если он в наличии И есть доступные размеры
    const isAvailable = product.is_in_stock && hasAvailableSizes;

    if (isAvailable) {
      return NextResponse.json({ error: "Товар доступен для заказа" }, { status: 400 });
    }

    const { error } = await supabase.from("product_notifications").insert({
      user_id: session.userId,
      product_id: params.id,
    });

    if (error) {
      if (error.code === "23505") {
        // Уже подписан
        return NextResponse.json({ success: true, isNotificationEnabled: true });
      }
      console.error("Notification add error:", error);
      return NextResponse.json({ error: "Ошибка подписки на уведомление" }, { status: 500 });
    }

    return NextResponse.json({ success: true, isNotificationEnabled: true });
  } catch (error) {
    console.error("Notification API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// Отписаться от уведомления
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("product_notifications")
      .delete()
      .eq("user_id", session.userId)
      .eq("product_id", params.id);

    if (error) {
      console.error("Notification remove error:", error);
      return NextResponse.json({ error: "Ошибка отписки" }, { status: 500 });
    }

    return NextResponse.json({ success: true, isNotificationEnabled: false });
  } catch (error) {
    console.error("Notification API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

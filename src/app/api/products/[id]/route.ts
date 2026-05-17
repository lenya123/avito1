import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Очищает истёкшие резервы и возвращает их quantity
 */
async function cleanupExpiredReservations(supabase: SupabaseClient): Promise<void> {
  const { data: expiredReservations } = await supabase
    .from("size_reservations")
    .select("id, product_size_id")
    .lt("expires_at", new Date().toISOString());

  if (!expiredReservations || expiredReservations.length === 0) return;

  for (const reservation of expiredReservations) {
    if (reservation.product_size_id) {
      const { data: productSize } = await supabase
        .from("product_sizes")
        .select("reserved_quantity")
        .eq("id", reservation.product_size_id)
        .single();

      if (productSize) {
        await supabase
          .from("product_sizes")
          .update({
            reserved_quantity: Math.max((productSize.reserved_quantity || 0) - 1, 0),
          })
          .eq("id", reservation.product_size_id);
      }
    }
    await supabase.from("size_reservations").delete().eq("id", reservation.id);
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = params;

    // Валидация UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: "Неверный ID товара" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Очищаем истёкшие резервы при загрузке страницы товара
    await cleanupExpiredReservations(supabase);

    const { data: product, error } = await supabase
      .from("products")
      .select(
        `
        *,
        sizes:product_sizes(*)
      `
      )
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const isPremium =
      session.isVibePlus ||
      session.subscriptionTier === "premium" ||
      session.subscriptionTier === "top_floor_boss";

    // Проверка доступа к premium товару
    if (product.is_premium && !isPremium) {
      return NextResponse.json(
        { error: "Товар доступен только для Premium подписчиков" },
        { status: 403 }
      );
    }

    // Проверка доступа к товару в пути (для не-premium)
    if (!product.is_in_stock && !isPremium) {
      return NextResponse.json(
        { error: "Товар доступен только для Premium подписчиков" },
        { status: 403 }
      );
    }

    // Проверяем избранное
    const { data: favorite } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", session.userId)
      .eq("product_id", id)
      .single();

    // Проверяем подписку на уведомления
    const { data: notification } = await supabase
      .from("product_notifications")
      .select("id")
      .eq("user_id", session.userId)
      .eq("product_id", id)
      .eq("notified", false)
      .single();

    // Форматируем размеры с доступностью
    const sizesWithAvailability =
      product.sizes?.map(
        (size: {
          id: string;
          size: string;
          current_quantity: number;
          reserved_quantity: number | null;
          initial_quantity: number;
        }) => ({
          id: size.id,
          size: size.size,
          available: size.current_quantity - (size.reserved_quantity || 0),
          isAvailable: size.current_quantity > (size.reserved_quantity || 0),
        })
      ) || [];

    return NextResponse.json({
      product: {
        ...product,
        isFavorite: !!favorite,
        isNotificationEnabled: !!notification,
        sizesWithAvailability,
        availableSizes: sizesWithAvailability
          .filter((s: { isAvailable: boolean }) => s.isAvailable)
          .map((s: { size: string }) => s.size),
      },
    });
  } catch (error) {
    console.error("Product API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

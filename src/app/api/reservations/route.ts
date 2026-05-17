import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { SupabaseClient } from "@supabase/supabase-js";

// === Schemas ===
const createReservationSchema = z
  .object({
    productSizeId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
  })
  .refine((d) => (d.productSizeId && !d.productId) || (!d.productSizeId && d.productId), {
    message: "Нужен productSizeId или productId",
  });

const deleteReservationSchema = z.object({
  reservationId: z.string().uuid(),
});

// === Constants ===
const MAX_RESERVATIONS_PER_USER = 3;
const RESERVATION_TIMEOUT_MINUTES = 10;

// === Types ===
type Reservation = {
  id: string;
  product_size_id: string | null;
  product_id: string | null;
  session_id?: string | null;
};

/**
 * Уменьшает reserved_quantity для размера (атомарно через RPC)
 */
async function decreaseReservedQuantity(
  supabase: SupabaseClient,
  productSizeId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("decrement_reserved_quantity_safe", {
    target_size_id: productSizeId,
  });
}

/**
 * Уменьшает reserved_quantity для товара без размеров (атомарно через RPC)
 */
async function decreaseProductReservedQuantity(
  supabase: SupabaseClient,
  productId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("decrement_reserved_quantity_safe", {
    target_product_id: productId,
  });
}

/**
 * Удаляет резерв и возвращает quantity
 */
async function deleteReservationWithCleanup(
  supabase: SupabaseClient,
  reservation: Reservation
): Promise<void> {
  if (reservation.product_size_id) {
    await decreaseReservedQuantity(supabase, reservation.product_size_id);
  } else if (reservation.product_id) {
    await decreaseProductReservedQuantity(supabase, reservation.product_id);
  }
  await supabase.from("size_reservations").delete().eq("id", reservation.id);
}

/**
 * Очищает истёкшие резервы и возвращает их quantity
 */
async function cleanupExpiredReservations(supabase: SupabaseClient): Promise<void> {
  // Получаем истёкшие резервы
  const { data: expiredReservations } = await supabase
    .from("size_reservations")
    .select("id, product_size_id, product_id")
    .lt("expires_at", new Date().toISOString());

  if (!expiredReservations || expiredReservations.length === 0) return;

  // Удаляем каждый с возвратом quantity
  for (const reservation of expiredReservations) {
    await deleteReservationWithCleanup(supabase, reservation);
  }
}

// === API Handlers ===

// GET /api/reservations — получить активные резервы пользователя
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Очищаем истёкшие резервы с возвратом quantity
    await cleanupExpiredReservations(supabase);

    // Получаем активные резервы (размерные + товарные)
    const { data: reservations, error } = await supabase
      .from("size_reservations")
      .select(
        `
        *,
        product_size:product_sizes(
          id, size, product_id,
          product:products(id, name, brand, photo_urls, drop_price)
        ),
        product:products(id, name, brand, photo_urls, drop_price)
      `
      )
      .eq("user_id", session.userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Reservations fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки резервов" }, { status: 500 });
    }

    return NextResponse.json({
      reservations: reservations || [],
      count: reservations?.length || 0,
    });
  } catch (error) {
    console.error("Reservations API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST /api/reservations — создать резерв
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = createReservationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { productSizeId, productId, sessionId } = result.data;
    const reservationSessionId = sessionId || uuidv4();
    const supabase = createServiceClient();

    // 1. Очищаем истёкшие резервы в фоне — не блокируем текущую операцию
    cleanupExpiredReservations(supabase).catch(console.error);

    // 2. Получаем активные резервы пользователя
    const { data: userReservations } = await supabase
      .from("size_reservations")
      .select("id, product_size_id, product_id, session_id")
      .eq("user_id", session.userId)
      .gt("expires_at", new Date().toISOString());

    let activeReservations = userReservations ?? [];

    // Если передан sessionId, проверяем резерв этой вкладки
    if (reservationSessionId && activeReservations.length > 0) {
      const sameSessionReservation = activeReservations.find(
        (r) => r.session_id === reservationSessionId
      );
      if (sameSessionReservation) {
        // Если это тот же размер/товар — возвращаем существующий резерв, не сбрасываем таймер
        const isSameTarget =
          (productSizeId && sameSessionReservation.product_size_id === productSizeId) ||
          (productId && sameSessionReservation.product_id === productId);

        if (isSameTarget) {
          const { data: existingReservation } = await supabase
            .from("size_reservations")
            .select(
              `*, product_size:product_sizes(id, size, product_id, product:products(id, name, brand, photo_urls, drop_price))`
            )
            .eq("id", sameSessionReservation.id)
            .single();

          return NextResponse.json({
            success: true,
            reservation: existingReservation,
            expiresAt: existingReservation?.expires_at,
            timeoutMinutes: RESERVATION_TIMEOUT_MINUTES,
          });
        }

        // Другой размер — удаляем старый и создаём новый
        await deleteReservationWithCleanup(supabase, sameSessionReservation);
        activeReservations = activeReservations.filter((r) => r.id !== sameSessionReservation.id);
      }
    }

    // Проверяем лимит (используем уже полученные данные, без лишнего запроса к БД)
    const reservationCount = activeReservations.length;
    if (reservationCount >= MAX_RESERVATIONS_PER_USER) {
      return NextResponse.json(
        {
          error: "LIMIT_EXCEEDED",
          message: `Достигнут лимит резервирования (${reservationCount}/${MAX_RESERVATIONS_PER_USER}). Завершите или отмените текущие заказы.`,
          code: "RESERVATION_LIMIT_EXCEEDED",
          current: reservationCount,
          max: MAX_RESERVATIONS_PER_USER,
        },
        { status: 400 }
      );
    }

    // 3. Устанавливаем время истечения
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESERVATION_TIMEOUT_MINUTES);

    const reservationId = uuidv4();

    if (productSizeId) {
      // === Резервирование размера (существующая логика) ===

      const { data: productSize, error: sizeError } = await supabase
        .from("product_sizes")
        .select("*")
        .eq("id", productSizeId)
        .single();

      if (sizeError || !productSize) {
        return NextResponse.json({ error: "Размер не найден" }, { status: 404 });
      }

      const available = productSize.current_quantity - (productSize.reserved_quantity || 0);
      if (available <= 0) {
        return NextResponse.json({ error: "Размер недоступен" }, { status: 400 });
      }

      // Атомарный инкремент reserved_quantity через RPC (добавлен в миграции 20260220000003)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateSizeError } = await (supabase.rpc as any)(
        "increment_reserved_quantity",
        {
          target_size_id: productSizeId,
        }
      );

      if (updateSizeError) {
        console.error("Update size error:", updateSizeError);
        return NextResponse.json({ error: "Ошибка резервирования" }, { status: 500 });
      }

      const { data: reservation, error: reservationError } = await supabase
        .from("size_reservations")
        .insert({
          id: reservationId,
          user_id: session.userId,
          product_size_id: productSizeId,
          session_id: reservationSessionId,
          expires_at: expiresAt.toISOString(),
        })
        .select(
          `
          *,
          product_size:product_sizes(
            id, size, product_id,
            product:products(id, name, brand, photo_urls, drop_price)
          )
        `
        )
        .single();

      if (reservationError) {
        console.error("Create reservation error:", reservationError);
        await decreaseReservedQuantity(supabase, productSizeId);
        return NextResponse.json({ error: "Ошибка создания резерва" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        reservation,
        expiresAt: expiresAt.toISOString(),
        timeoutMinutes: RESERVATION_TIMEOUT_MINUTES,
      });
    } else if (productId) {
      // === Резервирование товара без размеров ===

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, name, brand, photo_urls, drop_price, current_quantity, reserved_quantity")
        .eq("id", productId)
        .single();

      if (productError || !product) {
        return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
      }

      if (product.current_quantity == null) {
        return NextResponse.json({ error: "У товара нет учёта остатков" }, { status: 400 });
      }

      const available = product.current_quantity - (product.reserved_quantity || 0);
      if (available <= 0) {
        return NextResponse.json({ error: "Товар недоступен" }, { status: 400 });
      }

      // Атомарный инкремент reserved_quantity через RPC (добавлен в миграции 20260220000003)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateProductError } = await (supabase.rpc as any)(
        "increment_reserved_quantity",
        { target_product_id: productId }
      );

      if (updateProductError) {
        console.error("Update product error:", updateProductError);
        return NextResponse.json({ error: "Ошибка резервирования" }, { status: 500 });
      }

      const { data: reservation, error: reservationError } = await supabase
        .from("size_reservations")
        .insert({
          id: reservationId,
          user_id: session.userId,
          product_id: productId,
          session_id: reservationSessionId,
          expires_at: expiresAt.toISOString(),
        })
        .select(
          `
          *,
          product:products(id, name, brand, photo_urls, drop_price)
        `
        )
        .single();

      if (reservationError) {
        console.error("Create reservation error:", reservationError);
        await decreaseProductReservedQuantity(supabase, productId);
        return NextResponse.json({ error: "Ошибка создания резерва" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        reservation,
        expiresAt: expiresAt.toISOString(),
        timeoutMinutes: RESERVATION_TIMEOUT_MINUTES,
      });
    } else {
      return NextResponse.json({ error: "Нужен productSizeId или productId" }, { status: 400 });
    }
  } catch (error) {
    console.error("Create reservation API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// DELETE /api/reservations — удалить резерв
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = deleteReservationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { reservationId } = result.data;
    const supabase = createServiceClient();

    // Получаем резервирование
    const { data: reservation, error: reservationError } = await supabase
      .from("size_reservations")
      .select("id, product_size_id, product_id")
      .eq("id", reservationId)
      .eq("user_id", session.userId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json({ error: "Резерв не найден" }, { status: 404 });
    }

    // Удаляем с возвратом quantity
    await deleteReservationWithCleanup(supabase, reservation);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete reservation API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

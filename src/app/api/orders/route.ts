import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";
import {
  calculatePriceBreakdown,
  calculateDeduction,
  canUserOrder,
  DAILY_ORDER_LIMIT_BASIC,
} from "@/utils/pricing";
import { v4 as uuidv4 } from "uuid";
import { scheduleOrderExpiration, scheduleDeadlineReminder } from "@/lib/jobs";

// Схема для создания заказа
// barcodeImageUrl может быть:
// - data URL (base64): "data:image/png;base64,..."
// - обычный URL: "https://..."
const createOrderSchema = z.object({
  productId: z.string().uuid(),
  productSizeId: z.string().uuid().optional().nullable(),
  size: z.string().min(1).optional().nullable(),
  deliveryService: z.enum(["avito", "yandex", "cdek", "pochta", "5post"]),
  trackingNumber: z.string().min(1),
  deliveryDeadline: z.string().datetime(),
  barcodeImageUrl: z
    .string()
    .refine(
      (val) =>
        val.startsWith("data:image/") || val.startsWith("http://") || val.startsWith("https://"),
      { message: "Должен быть URL изображения или data URL" }
    )
    .optional(),
  salePrice: z.number().positive().optional(),
  comment: z.string().max(60).optional(),
  reservationId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

// Схема для фильтрации списка заказов
const listOrdersSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// GET /api/orders — список заказов клиента
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    const result = listOrdersSchema.safeParse(params);
    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные параметры", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, status, dateFrom, dateTo } = result.data;
    const offset = (page - 1) * limit;

    const supabase = createServiceClient();

    let query = supabase
      .from("orders")
      .select(
        `
        *,
        product:products(id, name, brand, photo_urls, drop_price),
        product_size:product_sizes(id, size)
      `,
        { count: "exact" }
      )
      .eq("client_id", session.userId)
      .order("created_at", { ascending: false });

    // Фильтр по статусу
    if (status) {
      query = query.eq("status", status);
    }

    // Фильтр по датам
    // dateFrom/dateTo приходят в формате "YYYY-MM-DD"
    // Нужно добавить время для корректной фильтрации
    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00Z`);
    }
    if (dateTo) {
      // Используем конец дня (23:59:59.999) чтобы включить все заказы за этот день
      query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
    }

    // Пагинация
    query = query.range(offset, offset + limit - 1);

    const { data: orders, error, count } = await query;

    if (error) {
      console.error("Orders fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки заказов" }, { status: 500 });
    }

    return NextResponse.json({
      orders: orders || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Orders API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST /api/orders — создание заказа
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    console.log("Order creation request body:", JSON.stringify(body, null, 2));

    const result = createOrderSchema.safeParse(body);

    if (!result.success) {
      console.error("Order validation error:", result.error.flatten());
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const {
      productId,
      productSizeId,
      size,
      deliveryService,
      trackingNumber,
      deliveryDeadline,
      barcodeImageUrl,
      salePrice,
      comment,
      reservationId,
      idempotencyKey,
    } = result.data;

    const supabase = createServiceClient();

    // Проверка идемпотентности
    if (idempotencyKey) {
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("idempotency_key", idempotencyKey)
        .single();

      if (existingOrder) {
        return NextResponse.json({
          success: true,
          order: existingOrder,
          message: "Заказ уже существует",
        });
      }
    }

    // Получаем данные пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", session.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Проверка блокировки
    if (user.is_blocked) {
      return NextResponse.json(
        { error: "Аккаунт заблокирован", reason: user.blocked_reason },
        { status: 403 }
      );
    }

    // Проверка подписки (кроме +ВАЙБ)
    if (!user.is_vibe_plus) {
      const subscriptionEnd = user.subscription_end ? new Date(user.subscription_end) : null;
      if (!subscriptionEnd || subscriptionEnd < new Date()) {
        return NextResponse.json({ error: "Подписка истекла" }, { status: 403 });
      }
    }

    // Получаем товар
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("is_active", true)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Проверка premium товара
    if (product.is_premium && !user.is_vibe_plus) {
      return NextResponse.json({ error: "Товар доступен только для +ВАЙБ" }, { status: 403 });
    }

    // Получаем размер (если товар с размерами)
    if (productSizeId) {
      const { data: productSize, error: sizeError } = await supabase
        .from("product_sizes")
        .select("*")
        .eq("id", productSizeId)
        .eq("product_id", productId)
        .single();

      if (sizeError || !productSize) {
        return NextResponse.json({ error: "Размер не найден" }, { status: 404 });
      }

      // Проверка наличия размера
      const available = productSize.current_quantity - (productSize.reserved_quantity || 0);
      if (available <= 0) {
        return NextResponse.json({ error: "Размер недоступен" }, { status: 400 });
      }
    } else {
      // Товар без размеров — проверяем что у него действительно нет доступных размеров
      const { count } = await supabase
        .from("product_sizes")
        .select("*", { count: "exact", head: true })
        .eq("product_id", productId)
        .gt("current_quantity", 0);

      if (count && count > 0) {
        return NextResponse.json({ error: "Необходимо выбрать размер" }, { status: 400 });
      }

      // Проверяем наличие на уровне товара
      if (product.current_quantity != null) {
        const available = product.current_quantity - (product.reserved_quantity || 0);
        if (available <= 0) {
          return NextResponse.json({ error: "Товар недоступен" }, { status: 400 });
        }
      }
    }

    // Проверка лимита заказов в день
    // Basic = 3 заказа/день, Premium+ и +ВАЙБ = без лимита
    const hasUnlimitedOrders =
      user.is_vibe_plus ||
      user.subscription_tier === "premium" ||
      user.subscription_tier === "top_floor_boss";

    if (!hasUnlimitedOrders) {
      const today = new Date().toISOString().split("T")[0];
      const { count: todayOrdersCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("client_id", session.userId)
        .gte("created_at", `${today}T00:00:00Z`);

      if ((todayOrdersCount || 0) >= DAILY_ORDER_LIMIT_BASIC) {
        return NextResponse.json(
          {
            error: "Превышен лимит заказов на сегодня",
            details: {
              limit: DAILY_ORDER_LIMIT_BASIC,
              used: todayOrdersCount,
              upgrade: "Перейдите на Premium для безлимитных заказов",
            },
          },
          { status: 400 }
        );
      }
    }

    // Расчёт цены
    const isFirstOrder = !user.first_order_discount_used;
    const discountPercent = user.is_vibe_plus ? 10 : user.discount_percent || 0;

    const pricing = calculatePriceBreakdown({
      dropPrice: product.drop_price,
      discountPercent,
      isFirstOrder,
    });

    // Проверка возможности оплаты
    const canOrder = canUserOrder({
      deposit: user.deposit || 0,
      referralDeposit: user.referral_deposit || 0,
      isVibePlus: user.is_vibe_plus || false,
      depositLimit: user.deposit_limit || 0,
      price: pricing.finalPrice,
    });

    if (!canOrder.allowed) {
      return NextResponse.json(
        { error: "Недостаточно средств на депозите", details: canOrder },
        { status: 400 }
      );
    }

    // Расчёт списания
    const deduction = calculateDeduction({
      price: pricing.finalPrice,
      deposit: user.deposit || 0,
      referralDeposit: user.referral_deposit || 0,
    });

    // Создаём заказ в транзакции (используем RPC или последовательные операции)
    const orderId = uuidv4();
    const orderIdempotencyKey = idempotencyKey || uuidv4();

    // Управление остатками
    let freshProductSize: { current_quantity: number; reserved_quantity: number | null } | null =
      null;
    let freshProduct: { current_quantity: number; reserved_quantity: number | null } | null = null;

    if (productSizeId) {
      // 1. Если есть резервирование — удаляем его атомарно (с RETURNING)
      // Это предотвращает race condition с cleanup endpoint
      let reservationWasDeleted = false;
      if (reservationId) {
        const { data: deletedReservation } = await supabase
          .from("size_reservations")
          .delete()
          .eq("id", reservationId)
          .eq("user_id", session.userId)
          .select("id")
          .single();

        reservationWasDeleted = !!deletedReservation;
      }

      // 2. Перечитываем актуальное состояние размера (могло измениться из-за cleanup)
      const { data: freshSize, error: freshSizeError } = await supabase
        .from("product_sizes")
        .select("current_quantity, reserved_quantity")
        .eq("id", productSizeId)
        .single();

      if (freshSizeError || !freshSize) {
        console.error("Fresh size fetch error:", freshSizeError);
        return NextResponse.json({ error: "Ошибка получения размера" }, { status: 500 });
      }

      freshProductSize = freshSize;

      // Проверяем что товар ещё есть
      if (freshProductSize.current_quantity <= 0) {
        return NextResponse.json({ error: "Товар закончился" }, { status: 400 });
      }

      // 3. Обновляем количество размера
      // - current_quantity уменьшаем на 1 (товар продан)
      // - reserved_quantity уменьшаем на 1 ТОЛЬКО если МЫ удалили резерв
      const newReservedQty = reservationWasDeleted
        ? Math.max((freshProductSize.reserved_quantity || 0) - 1, 0)
        : freshProductSize.reserved_quantity || 0;

      const { data: updatedSizeRows, error: updateSizeError } = await supabase
        .from("product_sizes")
        .update({
          current_quantity: freshProductSize.current_quantity - 1,
          reserved_quantity: newReservedQty,
        })
        .eq("id", productSizeId)
        .eq("current_quantity", freshProductSize.current_quantity) // Optimistic lock
        .select("id");

      if (updateSizeError) {
        console.error("Update size error:", updateSizeError);
        return NextResponse.json({ error: "Ошибка обновления размера" }, { status: 500 });
      }

      if (!updatedSizeRows || updatedSizeRows.length === 0) {
        return NextResponse.json(
          { error: "Товар был изменён другим пользователем, попробуйте снова" },
          { status: 409 }
        );
      }
    } else if (product.current_quantity != null) {
      // Товар без размеров — управление остатками на уровне продукта

      // 1. Если есть резервирование — удаляем его атомарно
      let reservationWasDeleted = false;
      if (reservationId) {
        const { data: deletedReservation } = await supabase
          .from("size_reservations")
          .delete()
          .eq("id", reservationId)
          .eq("user_id", session.userId)
          .select("id")
          .single();

        reservationWasDeleted = !!deletedReservation;
      }

      // 2. Перечитываем актуальное состояние товара
      const { data: freshProd, error: freshProdError } = await supabase
        .from("products")
        .select("current_quantity, reserved_quantity")
        .eq("id", productId)
        .single();

      if (freshProdError || !freshProd || freshProd.current_quantity == null) {
        console.error("Fresh product fetch error:", freshProdError);
        return NextResponse.json({ error: "Ошибка получения товара" }, { status: 500 });
      }

      freshProduct = freshProd as { current_quantity: number; reserved_quantity: number | null };

      if (freshProduct.current_quantity <= 0) {
        return NextResponse.json({ error: "Товар закончился" }, { status: 400 });
      }

      // 3. Обновляем количество товара
      const newReservedQty = reservationWasDeleted
        ? Math.max((freshProduct.reserved_quantity || 0) - 1, 0)
        : freshProduct.reserved_quantity || 0;

      const { data: updatedProductRows, error: updateProductError } = await supabase
        .from("products")
        .update({
          current_quantity: freshProduct.current_quantity - 1,
          reserved_quantity: newReservedQty,
        })
        .eq("id", productId)
        .eq("current_quantity", freshProduct.current_quantity) // Optimistic lock
        .select("id");

      if (updateProductError) {
        console.error("Update product error:", updateProductError);
        return NextResponse.json({ error: "Ошибка обновления остатков" }, { status: 500 });
      }

      if (!updatedProductRows || updatedProductRows.length === 0) {
        return NextResponse.json(
          { error: "Товар был изменён другим пользователем, попробуйте снова" },
          { status: 409 }
        );
      }
    }

    // 4. Обновляем баланс пользователя
    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        deposit: deduction.newDeposit,
        referral_deposit: deduction.newReferralDeposit,
        first_order_discount_used: true,
      })
      .eq("id", session.userId);

    if (updateUserError) {
      console.error("Update user error:", updateUserError);
      // Откатываем изменение остатков (используем актуальные значения)
      if (productSizeId && freshProductSize) {
        await supabase
          .from("product_sizes")
          .update({
            current_quantity: freshProductSize.current_quantity,
            reserved_quantity: freshProductSize.reserved_quantity,
          })
          .eq("id", productSizeId);
      } else if (freshProduct) {
        await supabase
          .from("products")
          .update({
            current_quantity: freshProduct.current_quantity,
            reserved_quantity: freshProduct.reserved_quantity,
          })
          .eq("id", productId);
      }
      return NextResponse.json({ error: "Ошибка обновления баланса" }, { status: 500 });
    }

    // 5. Создаём заказ
    // client_profit — generated column, вычисляется автоматически как sale_price - client_price
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        client_id: session.userId,
        product_id: productId,
        product_size_id: productSizeId || null,
        size: size || null,
        delivery_service: deliveryService,
        tracking_number: trackingNumber,
        delivery_deadline: deliveryDeadline,
        barcode_image_url: barcodeImageUrl || null,
        sale_price: salePrice || null,
        client_comment: comment || null,
        client_price: pricing.finalPrice,
        purchase_price: product.drop_price,
        status: "awaiting_shipment",
        status_history: [{ status: "awaiting_shipment", timestamp: new Date().toISOString() }],
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: canOrder.method,
        idempotency_key: orderIdempotencyKey,
      })
      .select("id, order_number, status, client_price, created_at")
      .single();

    if (orderError) {
      console.error("Create order error:", orderError);
      // Откатываем изменения (используем актуальные значения)
      if (productSizeId && freshProductSize) {
        await supabase
          .from("product_sizes")
          .update({
            current_quantity: freshProductSize.current_quantity,
            reserved_quantity: freshProductSize.reserved_quantity,
          })
          .eq("id", productSizeId);
      } else if (freshProduct) {
        await supabase
          .from("products")
          .update({
            current_quantity: freshProduct.current_quantity,
            reserved_quantity: freshProduct.reserved_quantity,
          })
          .eq("id", productId);
      }
      await supabase
        .from("users")
        .update({
          deposit: user.deposit,
          referral_deposit: user.referral_deposit,
          first_order_discount_used: user.first_order_discount_used,
        })
        .eq("id", session.userId);
      return NextResponse.json({ error: "Ошибка создания заказа" }, { status: 500 });
    }

    // 5. Логируем действие
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "order_created",
      entity_type: "order",
      entity_id: orderId,
      details: {
        product_id: productId,
        size,
        price: pricing.finalPrice,
        discount: pricing.totalDiscount,
      },
    });

    // 6. Планируем автоматизации (BullMQ jobs)
    // Если Redis недоступен — не прерываем создание заказа
    try {
      const deadlineDate = new Date(deliveryDeadline);

      // Автоотмена в конце дня дедлайна
      await scheduleOrderExpiration(orderId, deadlineDate);

      // Напоминание за день до дедлайна (если больше 1 дня)
      await scheduleDeadlineReminder(orderId, deadlineDate);
    } catch (jobError) {
      // Логируем, но не блокируем заказ
      console.error("[Orders API] Failed to schedule jobs:", jobError);
      // TODO: Отправить алерт владельцу
    }

    return NextResponse.json({
      success: true,
      order,
      pricing: {
        basePrice: pricing.basePrice,
        firstOrderDiscount: pricing.firstOrderDiscount,
        levelDiscount: pricing.levelDiscount,
        totalDiscount: pricing.totalDiscount,
        finalPrice: pricing.finalPrice,
      },
      deduction: {
        fromDeposit: deduction.fromDeposit,
        fromReferralDeposit: deduction.fromReferralDeposit,
      },
    });
  } catch (error) {
    console.error("Create order API error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Ошибка сервера", details: errorMessage }, { status: 500 });
  }
}

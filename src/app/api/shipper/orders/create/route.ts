import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const createManualOrderSchema = z.object({
  product_id: z.string().uuid(),
  product_size_id: z.string().uuid().optional(),
  size: z.string().optional(),
  delivery_service: z.enum(["avito", "yandex", "cdek", "pochta", "5post"]),
});

export async function POST(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = createManualOrderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { product_id, product_size_id, size, delivery_service } = result.data;
    const supabase = createServiceClient();

    // 1. Fetch product
    const { data: product, error: productError } = await supabase
      .from("products")
      .select(
        "id, name, is_active, purchase_price, drop_price, current_quantity, reserved_quantity"
      )
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    if (!product.is_active) {
      return NextResponse.json({ error: "Товар неактивен" }, { status: 400 });
    }

    // 2. Check if product has sizes but none selected
    if (!product_size_id) {
      const { count } = await supabase
        .from("product_sizes")
        .select("*", { count: "exact", head: true })
        .eq("product_id", product_id)
        .gt("current_quantity", 0);

      if (count && count > 0) {
        return NextResponse.json({ error: "Необходимо выбрать размер" }, { status: 400 });
      }

      // Product without sizes — check stock
      if (product.current_quantity != null && product.current_quantity <= 0) {
        return NextResponse.json({ error: "Товар закончился" }, { status: 400 });
      }
    }

    // 3. Handle inventory decrement (optimistic lock)
    let freshQuantity: number | null = null;

    if (product_size_id) {
      // Sized product
      const { data: productSize, error: sizeError } = await supabase
        .from("product_sizes")
        .select("id, size, current_quantity, reserved_quantity")
        .eq("id", product_size_id)
        .eq("product_id", product_id)
        .single();

      if (sizeError || !productSize) {
        return NextResponse.json({ error: "Размер не найден" }, { status: 404 });
      }

      if (productSize.current_quantity <= 0) {
        return NextResponse.json({ error: "Размер закончился" }, { status: 400 });
      }

      freshQuantity = productSize.current_quantity;

      const { data: updated, error: updateError } = await supabase
        .from("product_sizes")
        .update({ current_quantity: productSize.current_quantity - 1 })
        .eq("id", product_size_id)
        .eq("current_quantity", productSize.current_quantity) // optimistic lock
        .select("id");

      if (updateError || !updated || updated.length === 0) {
        return NextResponse.json({ error: "Товар был изменён, попробуйте снова" }, { status: 409 });
      }
    } else if (product.current_quantity != null) {
      // Non-sized product
      freshQuantity = product.current_quantity;

      const { data: updated, error: updateError } = await supabase
        .from("products")
        .update({ current_quantity: product.current_quantity - 1 })
        .eq("id", product_id)
        .eq("current_quantity", product.current_quantity) // optimistic lock
        .select("id");

      if (updateError || !updated || updated.length === 0) {
        return NextResponse.json({ error: "Товар был изменён, попробуйте снова" }, { status: 409 });
      }
    }

    // 4. Find owner user for client_id
    const { data: owner, error: ownerError } = await supabase
      .from("users")
      .select("id")
      .eq("role", "owner")
      .limit(1)
      .single();

    if (ownerError || !owner) {
      // Rollback inventory
      if (product_size_id && freshQuantity != null) {
        await supabase
          .from("product_sizes")
          .update({ current_quantity: freshQuantity })
          .eq("id", product_size_id);
      } else if (freshQuantity != null) {
        await supabase
          .from("products")
          .update({ current_quantity: freshQuantity })
          .eq("id", product_id);
      }
      return NextResponse.json({ error: "Владелец не найден" }, { status: 500 });
    }

    // 5. Create order
    const orderId = uuidv4();
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 7);

    // Generate tracking number based on delivery service
    const trackingPrefixes: Record<string, string> = {
      cdek: "CDEK",
      pochta: "RU",
      "5post": "5P",
      avito: "AV",
      yandex: "YA",
    };
    const prefix = trackingPrefixes[delivery_service] || "TR";
    const randomPart = Math.floor(1000000 + Math.random() * 9000000);
    const trackingNumber = `${prefix}-${randomPart}`;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        client_id: owner.id,
        product_id,
        product_size_id: product_size_id || null,
        size: size || null,
        delivery_service,
        delivery_deadline: deadlineDate.toISOString().split("T")[0],
        purchase_price: product.purchase_price ?? 0,
        client_price: product.drop_price ?? 0,
        tracking_number: trackingNumber,
        status: "awaiting_shipment",
        source: "manual",
        status_history: [{ status: "awaiting_shipment", timestamp: new Date().toISOString() }],
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: "deposit",
      })
      .select("id, order_number, status")
      .single();

    if (orderError) {
      console.error("Create manual order error:", orderError);
      // Rollback inventory
      if (product_size_id && freshQuantity != null) {
        await supabase
          .from("product_sizes")
          .update({ current_quantity: freshQuantity })
          .eq("id", product_size_id);
      } else if (freshQuantity != null) {
        await supabase
          .from("products")
          .update({ current_quantity: freshQuantity })
          .eq("id", product_id);
      }
      return NextResponse.json({ error: "Ошибка создания заказа" }, { status: 500 });
    }

    // 6. Log activity
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "manual_order_created",
      entity_type: "order",
      entity_id: orderId,
      details: {
        product_id,
        product_size_id: product_size_id || null,
        size: size || null,
        delivery_service,
        source: "manual",
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
    });
  } catch (error) {
    console.error("Manual order creation error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

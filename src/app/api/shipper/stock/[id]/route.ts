import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: productId } = await params;
    const supabase = createServiceClient();

    // Проверяем что товар существует
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Проверяем что нет активных заказов с этим товаром
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .in("status", ["awaiting_shipment", "in_transit", "at_pickup_point", "problem"]);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Нельзя удалить — есть активные заказы (${count})` },
        { status: 409 }
      );
    }

    // Удаляем размеры, потом товар
    await supabase.from("product_sizes").delete().eq("product_id", productId);
    const { error: deleteError } = await supabase.from("products").delete().eq("id", productId);

    if (deleteError) {
      console.error("Product delete error:", deleteError);
      return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
    }

    // Логируем
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "product_deleted",
      entity_type: "product",
      entity_id: productId,
      details: { product_name: product.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Product delete error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const adjustSchema = z.object({
  sizes: z
    .array(
      z.object({
        size_id: z.string().uuid(),
        new_quantity: z.number().min(0),
      })
    )
    .optional(),
  new_sizes: z
    .array(
      z.object({
        size: z.string().min(1).max(10),
        quantity: z.number().min(0),
      })
    )
    .optional(),
  new_quantity: z.number().min(0).optional(),
  // Фактическое наличие (инвентаризация отправщика)
  actual_sizes: z
    .array(
      z.object({
        size_id: z.string().uuid(),
        actual_quantity: z.number().min(0),
      })
    )
    .optional(),
  actual_quantity: z.number().min(0).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: productId } = await params;
    const body = await request.json();
    const data = adjustSchema.parse(body);

    if (
      !data.sizes &&
      !data.new_sizes &&
      data.new_quantity === undefined &&
      !data.actual_sizes &&
      data.actual_quantity === undefined
    ) {
      return NextResponse.json(
        { error: "Нужно указать sizes, new_sizes, new_quantity, actual_sizes или actual_quantity" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Проверяем что товар существует
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // 1. Обновляем существующие размеры
    if (data.sizes && data.sizes.length > 0) {
      for (const sizeUpdate of data.sizes) {
        const { error: sizeError } = await supabase
          .from("product_sizes")
          .update({ current_quantity: sizeUpdate.new_quantity })
          .eq("id", sizeUpdate.size_id)
          .eq("product_id", productId);

        if (sizeError) {
          console.error("Size update error:", sizeError);
          return NextResponse.json({ error: "Ошибка обновления размера" }, { status: 500 });
        }
      }
    }

    // 2. Добавляем новые размеры
    if (data.new_sizes && data.new_sizes.length > 0) {
      const newSizesData = data.new_sizes.map((s) => ({
        product_id: productId,
        size: s.size.toUpperCase(),
        current_quantity: s.quantity,
        initial_quantity: s.quantity,
        reserved_quantity: 0,
      }));

      const { error: newSizesError } = await supabase.from("product_sizes").insert(newSizesData);

      if (newSizesError) {
        console.error("New sizes insert error:", newSizesError);
        return NextResponse.json({ error: "Ошибка добавления размеров" }, { status: 500 });
      }
    }

    // 3. Обновляем количество товара без размеров
    if (data.new_quantity !== undefined && !data.sizes && !data.new_sizes) {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          current_quantity: data.new_quantity,
          is_in_stock: data.new_quantity > 0,
        })
        .eq("id", productId);

      if (updateError) {
        console.error("Product update error:", updateError);
        return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
      }
    }

    // 4. Пересчитываем is_in_stock если были изменения в размерах
    if (data.sizes || data.new_sizes) {
      const { data: allSizes } = await supabase
        .from("product_sizes")
        .select("current_quantity")
        .eq("product_id", productId);

      const totalQuantity = (allSizes || []).reduce(
        (sum: number, s: { current_quantity: number }) => sum + s.current_quantity,
        0
      );

      await supabase
        .from("products")
        .update({ is_in_stock: totalQuantity > 0 })
        .eq("id", productId);
    }

    // 5. Обновляем actual_quantity для размеров (инвентаризация)
    if (data.actual_sizes && data.actual_sizes.length > 0) {
      for (const sizeUpdate of data.actual_sizes) {
        const { error: actualError } = await supabase
          .from("product_sizes")
          .update({ actual_quantity: sizeUpdate.actual_quantity })
          .eq("id", sizeUpdate.size_id)
          .eq("product_id", productId);

        if (actualError) {
          console.error("Actual quantity update error:", actualError);
          return NextResponse.json({ error: "Ошибка обновления факта" }, { status: 500 });
        }
      }
    }

    // 6. Обновляем actual_quantity для товара без размеров
    if (data.actual_quantity !== undefined && !data.actual_sizes) {
      const { error: actualError } = await supabase
        .from("products")
        .update({ actual_quantity: data.actual_quantity })
        .eq("id", productId);

      if (actualError) {
        console.error("Product actual quantity update error:", actualError);
        return NextResponse.json({ error: "Ошибка обновления факта" }, { status: 500 });
      }
    }

    // Логируем в activity_log
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "stock_adjustment",
      entity_type: "product",
      entity_id: productId,
      details: {
        product_name: product.name,
        ...(data.sizes ? { sizes: data.sizes } : {}),
        ...(data.new_sizes ? { new_sizes: data.new_sizes } : {}),
        ...(data.new_quantity !== undefined ? { new_quantity: data.new_quantity } : {}),
        ...(data.actual_sizes ? { actual_sizes: data.actual_sizes } : {}),
        ...(data.actual_quantity !== undefined ? { actual_quantity: data.actual_quantity } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Stock adjust error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

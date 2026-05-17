import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

async function getOwnerSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    if (session.role !== "owner") return null;
    return session;
  } catch {
    return null;
  }
}

// GET - получить детали товара
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    // Получаем товар с размерами
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*, product_sizes(id, size, current_quantity, initial_quantity)")
      .eq("id", id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Статистика продаж
    const { data: orders } = await supabase
      .from("orders")
      .select("id, status, client_price")
      .eq("product_id", id);

    const sales = {
      total: orders?.length || 0,
      completed: orders?.filter((o) => o.status === "completed").length || 0,
      cancelled: orders?.filter((o) => o.status === "cancelled").length || 0,
      revenue:
        orders
          ?.filter((o) => o.status === "completed")
          .reduce((sum, o) => sum + (o.client_price || 0), 0) || 0,
      avgPrice: 0,
    };
    if (sales.completed > 0) {
      sales.avgPrice = Math.round(sales.revenue / sales.completed);
    }

    // Последние заказы
    const { data: recentOrders } = await supabase
      .from("orders")
      .select("id, order_number, status, client_price, size, created_at, client_id")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Получаем имена клиентов
    const clientIds = Array.from(new Set(recentOrders?.map((o) => o.client_id) || []));
    const { data: clients } =
      clientIds.length > 0
        ? await supabase.from("users").select("id, telegram_username").in("id", clientIds)
        : { data: [] };
    const clientMap: Record<string, string | null> = {};
    clients?.forEach((c) => {
      clientMap[c.id] = c.telegram_username;
    });

    const sizes =
      (product.product_sizes as Array<{
        id: string;
        size: string;
        current_quantity: number;
        initial_quantity: number;
      }>) || [];

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: product.description,
        purchasePrice: product.purchase_price,
        dropPrice: product.drop_price,
        recommendedPrice: product.recommended_price,
        photoUrls: product.photo_urls || [],
        isPremium: product.is_premium,
        isActive: product.is_active,
        isInStock: product.is_in_stock,
        expectedArrivalDate: product.expected_arrival_date,
        measurements: product.measurements,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        sizes: sizes.map((s) => ({
          id: s.id,
          size: s.size,
          currentQuantity: s.current_quantity,
          initialQuantity: s.initial_quantity,
        })),
        totalStock: sizes.reduce((sum, s) => sum + s.current_quantity, 0),
        totalInitial: sizes.reduce((sum, s) => sum + s.initial_quantity, 0),
      },
      sales,
      recentOrders:
        recentOrders?.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          price: o.client_price,
          size: o.size,
          createdAt: o.created_at,
          clientUsername: clientMap[o.client_id] || null,
        })) || [],
    });
  } catch (error) {
    console.error("Product detail API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PATCH - обновить товар
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  purchasePrice: z.number().min(0).optional(),
  dropPrice: z.number().min(0).optional(),
  recommendedPrice: z.number().nullable().optional(),
  photoUrls: z.array(z.string()).optional(),
  isPremium: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isInStock: z.boolean().optional(),
  expectedArrivalDate: z.string().nullable().optional(),
  measurements: z.record(z.string(), z.string()).nullable().optional(),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1),
        quantity: z.number().min(0),
      })
    )
    .optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateProductSchema.parse(body);

    const supabase = createServiceClient();

    // Проверяем товар
    const { data: existing, error: existError } = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .single();

    if (existError || !existing) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Формируем данные обновления
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.brand !== undefined) updateData.brand = data.brand;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.purchasePrice !== undefined) updateData.purchase_price = data.purchasePrice;
    if (data.dropPrice !== undefined) updateData.drop_price = data.dropPrice;
    if (data.recommendedPrice !== undefined) updateData.recommended_price = data.recommendedPrice;
    if (data.photoUrls !== undefined) updateData.photo_urls = data.photoUrls;
    if (data.isPremium !== undefined) updateData.is_premium = data.isPremium;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;
    if (data.isInStock !== undefined) updateData.is_in_stock = data.isInStock;
    if (data.expectedArrivalDate !== undefined)
      updateData.expected_arrival_date = data.expectedArrivalDate;
    if (data.measurements !== undefined) updateData.measurements = data.measurements;

    // Обновляем товар
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", id);
      if (updateError) {
        console.error("Product update error:", updateError);
        return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
      }
    }

    // Обновляем размеры (если переданы)
    if (data.sizes !== undefined) {
      // Удаляем старые
      await supabase.from("product_sizes").delete().eq("product_id", id);

      // Вставляем новые
      if (data.sizes.length > 0) {
        const sizesData = data.sizes.map((s) => ({
          product_id: id,
          size: s.size,
          initial_quantity: s.quantity,
          current_quantity: s.quantity,
        }));

        const { error: sizesError } = await supabase.from("product_sizes").insert(sizesData);
        if (sizesError) {
          console.error("Sizes update error:", sizesError);
          return NextResponse.json({ error: "Ошибка обновления размеров" }, { status: 500 });
        }
      }

      // Обновляем purchase_quantity
      const totalQuantity = data.sizes.reduce((sum, s) => sum + s.quantity, 0);
      await supabase.from("products").update({ purchase_quantity: totalQuantity }).eq("id", id);
    }

    // Логируем
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "product_updated",
      entity_type: "product",
      entity_id: id,
      details: { updatedFields: Object.keys(updateData) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("Product update API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// DELETE - деактивировать товар
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    // Проверяем товар
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Проверяем активные заказы
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact" })
      .eq("product_id", id)
      .in("status", ["awaiting_shipment", "collecting", "in_transit"]);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Нельзя удалить: у товара ${count} активных заказов` },
        { status: 400 }
      );
    }

    // Soft-delete
    const { error: deleteError } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", id);

    if (deleteError) {
      console.error("Product delete error:", deleteError);
      return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
    }

    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "product_deleted",
      entity_type: "product",
      entity_id: id,
      details: { name: product.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Product delete API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

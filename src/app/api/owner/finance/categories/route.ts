import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).optional(),
  color: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/** GET — list all expense categories */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("expense_categories")
      .select("id, name, color, sort_order, created_at")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Get expense categories error:", error);
      return NextResponse.json({ error: "Ошибка загрузки категорий" }, { status: 500 });
    }

    return NextResponse.json(
      (data || []).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        sortOrder: c.sort_order,
      }))
    );
  } catch (error) {
    console.error("Categories GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/** POST — create a new expense category */
export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = createSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get max sort_order
    const { data: existing } = await supabase
      .from("expense_categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from("expense_categories")
      .insert({
        name: result.data.name,
        color: result.data.color || "accent-orange",
        sort_order: nextOrder,
      })
      .select("id, name, color, sort_order")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Категория с таким именем уже существует" },
          { status: 409 }
        );
      }
      console.error("Create category error:", error);
      return NextResponse.json({ error: "Ошибка создания категории" }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      color: data.color,
      sortOrder: data.sort_order,
    });
  } catch (error) {
    console.error("Categories POST error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/** PATCH — update an expense category */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = updateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { id, name, color, sortOrder } = result.data;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("expense_categories").update(updates).eq("id", id);

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Категория с таким именем уже существует" },
          { status: 409 }
        );
      }
      console.error("Update category error:", error);
      return NextResponse.json({ error: "Ошибка обновления категории" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Categories PATCH error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/** DELETE — remove an expense category */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Не указан id категории" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Check if expenses use this category
    const { data: category } = await supabase
      .from("expense_categories")
      .select("name")
      .eq("id", id)
      .single();

    if (!category) {
      return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
    }

    const { count } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("category", category.name);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Невозможно удалить: ${count} расходов привязано к этой категории` },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("expense_categories").delete().eq("id", id);

    if (error) {
      console.error("Delete category error:", error);
      return NextResponse.json({ error: "Ошибка удаления категории" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Categories DELETE error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

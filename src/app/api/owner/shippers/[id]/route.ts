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

const updateShipperSchema = z.object({
  name: z.string().min(2, "Имя слишком короткое").optional(),
  telegramUsername: z.string().optional(),
  phone: z.string().optional(),
  workDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Дни не должны повторяться")
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
    const data = updateShipperSchema.parse(body);

    const supabase = createServiceClient();

    // Проверяем что отправщик существует
    const { data: shipper, error: shipperError } = await supabase
      .from("users")
      .select("id")
      .eq("id", id)
      .eq("role", "shipper")
      .single();

    if (shipperError || !shipper) {
      return NextResponse.json({ error: "Отправщик не найден" }, { status: 404 });
    }

    // Формируем данные обновления
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.telegramUsername !== undefined)
      updateData.telegram_username = data.telegramUsername || null;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.workDays !== undefined)
      updateData.work_days = [...data.workDays].sort((a, b) => a - b);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    const { error: updateError } = await supabase.from("users").update(updateData).eq("id", id);

    if (updateError) {
      console.error("Shipper update error:", updateError);
      return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
    }

    // Логируем действие
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "shipper_updated",
      entity_type: "user",
      entity_id: id,
      details: updateData as unknown as Record<string, string>,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Shipper update API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

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

    // Проверяем что отправщик существует
    const { data: shipper, error: shipperError } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", id)
      .eq("role", "shipper")
      .single();

    if (shipperError || !shipper) {
      return NextResponse.json({ error: "Отправщик не найден" }, { status: 404 });
    }

    // Проверяем нет ли активных заказов
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact" })
      .eq("shipped_by", id)
      .in("status", ["collecting", "in_transit"]);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Нельзя удалить: у отправщика ${count} активных заказов` },
        { status: 400 }
      );
    }

    // Удаляем отправщика
    const { error: deleteError } = await supabase.from("users").delete().eq("id", id);

    if (deleteError) {
      console.error("Shipper delete error:", deleteError);
      return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
    }

    // Логируем действие
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "shipper_deleted",
      entity_type: "user",
      entity_id: id,
      details: { name: shipper.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Shipper delete API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

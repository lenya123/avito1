import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const priceSchema = z.object({
  price: z.number().positive().max(999999999),
});

// POST — обновить цену объявления
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { itemId } = await params;
    const numericItemId = parseInt(itemId, 10);
    if (!numericItemId || numericItemId <= 0) {
      return NextResponse.json({ error: "Некорректный ID объявления" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = priceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Укажите корректную цену" }, { status: 400 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const client = await createAvitoClientForSession(session.id);
    if (!client) {
      return NextResponse.json({ error: "Avito клиент недоступен" }, { status: 500 });
    }

    const result = await client.updateItemPrice(numericItemId, parsed.data.price);

    if (!result.success) {
      console.error("[Avito Price] Error:", result.error);
      return NextResponse.json({ error: "Не удалось обновить цену" }, { status: 502 });
    }

    // Обновляем кеш
    const supabase = createServiceClient();
    await supabase
      .from("avito_items")
      .update({ price: parsed.data.price, updated_at: new Date().toISOString() })
      .eq("session_id", session.id)
      .eq("avito_item_id", numericItemId);

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Avito update price error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

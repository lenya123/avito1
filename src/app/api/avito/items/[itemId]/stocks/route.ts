import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const stocksSchema = z.object({
  stocks: z
    .array(
      z.object({
        sku: z.string().min(1).max(100),
        count: z.number().int().min(0),
      })
    )
    .min(1),
});

// GET — получить остатки по объявлению
export async function GET(
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

    const result = await client.getStocks(numericItemId);

    if (!result.success) {
      console.error("[Avito Stocks] GET error:", result.error);
      return NextResponse.json({ error: "Не удалось получить остатки" }, { status: 502 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Avito stocks GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PUT — обновить остатки объявления
export async function PUT(
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
    const parsed = stocksSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Укажите массив остатков: [{ sku, count }]" },
        { status: 400 }
      );
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

    const result = await client.updateStocks(numericItemId, parsed.data.stocks);

    if (!result.success) {
      console.error("[Avito Stocks] PUT error:", result.error);
      return NextResponse.json({ error: "Не удалось обновить остатки" }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avito stocks PUT error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

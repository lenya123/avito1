import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const applyVasSchema = z.object({
  itemId: z.number().int().positive(),
  vasId: z.string().min(1).max(100),
});

// GET — получить стоимость услуг продвижения для объявления
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
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

    const { searchParams } = new URL(request.url);
    const itemId = parseInt(searchParams.get("itemId") || "0", 10);
    if (!itemId) {
      return NextResponse.json({ error: "Укажите itemId" }, { status: 400 });
    }

    const result = await client.getVasPrices(itemId);

    if (!result.success) {
      console.error("[Avito Promotion] VAS prices error:", result.error);
      return NextResponse.json(
        { error: "Не удалось получить услуги продвижения" },
        { status: 502 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Avito promotion GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST — применить услугу продвижения к объявлению
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = applyVasSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Укажите ID объявления и тип услуги (vasId)" },
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

    const result = await client.applyVas(parsed.data.itemId, parsed.data.vasId);

    if (!result.success) {
      console.error("[Avito Promotion] Apply VAS error:", result.error);
      return NextResponse.json(
        { error: "Не удалось применить услугу продвижения" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Avito promotion POST error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

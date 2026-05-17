import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";

// GET — история финансовых операций
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
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const datetimeFrom = searchParams.get("from") || defaultFrom.toISOString();
    const datetimeTo = searchParams.get("to") || now.toISOString();

    const result = await client.getOperationsHistory(datetimeFrom, datetimeTo);

    if (!result.success) {
      console.error("[Avito Operations] Error:", result.error);
      return NextResponse.json({ error: "Не удалось загрузить историю операций" }, { status: 502 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Avito operations error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

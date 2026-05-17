import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";

// GET — позиции из отчёта автозагрузки
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { reportId } = await params;
    const numericReportId = parseInt(reportId, 10);
    if (!numericReportId || numericReportId <= 0) {
      return NextResponse.json({ error: "Некорректный ID отчёта" }, { status: 400 });
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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = parseInt(searchParams.get("per_page") || "100", 10);

    const result = await client.getAutoloadReportItems(
      numericReportId,
      page,
      Math.min(perPage, 100)
    );

    if (!result.success) {
      console.error("[Avito Autoload Report] Error:", result.error);
      return NextResponse.json({ error: "Не удалось загрузить отчёт" }, { status: 502 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Avito autoload report error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

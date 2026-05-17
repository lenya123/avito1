import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";

// DELETE — удалить свой ответ на отзыв
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ answerId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { answerId } = await params;
    const numericAnswerId = parseInt(answerId, 10);
    if (!numericAnswerId || numericAnswerId <= 0) {
      return NextResponse.json({ error: "Некорректный ID ответа" }, { status: 400 });
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

    const result = await client.deleteReviewAnswer(numericAnswerId);

    if (!result.success) {
      console.error("[Avito Reviews] Delete answer error:", result.error);
      return NextResponse.json({ error: "Не удалось удалить ответ" }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avito review answer DELETE error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

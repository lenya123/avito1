import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { scheduleAvitoItemAction } from "@/lib/jobs/queues";

// DELETE — удалить объявление (через браузер в воркере).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { itemId } = await params;

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;
    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const numericItemId = parseInt(itemId, 10);
    if (!numericItemId || numericItemId <= 0) {
      return NextResponse.json({ error: "Некорректный ID объявления" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: item } = await supabase
      .from("avito_items")
      .select("url, avito_item_id")
      .eq("session_id", session.id)
      .eq("avito_item_id", numericItemId)
      .maybeSingle();

    if (!item?.url) {
      return NextResponse.json(
        { error: "Объявление не найдено или нет ссылки. Синхронизируйте данные." },
        { status: 404 }
      );
    }

    const jobId = await scheduleAvitoItemAction({
      sessionId: session.id,
      userId,
      avitoItemId: String(item.avito_item_id),
      avitoItemUrl: item.url,
      action: "delete",
    });

    return NextResponse.json({ success: true, jobId, queued: true });
  } catch (error) {
    console.error("Avito item delete error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

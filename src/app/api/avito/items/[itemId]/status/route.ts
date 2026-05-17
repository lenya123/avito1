import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { scheduleAvitoItemAction } from "@/lib/jobs/queues";
import { z } from "zod";

const schema = z.object({ active: z.boolean() });

// POST — включить/выключить объявление (снять/вернуть в публикацию).
// Действие выполняется через браузер в BullMQ-воркере (антидетект сессии).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { itemId } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Укажите active: boolean" }, { status: 400 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;
    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: item } = await supabase
      .from("avito_items")
      .select("url, avito_item_id")
      .eq("session_id", session.id)
      .eq("avito_item_id", itemId)
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
      action: parsed.data.active ? "activate" : "deactivate",
    });

    // Оптимистично отражаем в кеше (воркер подтвердит/откатит)
    await supabase
      .from("avito_items")
      .update({
        status: parsed.data.active ? "active" : "removed",
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", session.id)
      .eq("avito_item_id", itemId);

    return NextResponse.json({ success: true, jobId, queued: true });
  } catch (error) {
    console.error("Avito item status error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

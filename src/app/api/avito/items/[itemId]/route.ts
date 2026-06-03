import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { scheduleAvitoItemAction } from "@/lib/jobs/queues";
import { getWebSessionById } from "@/lib/avito";
import { stopAvitoItemViaWeb, deleteAvitoItemViaWeb } from "@/lib/avito/web-client";

// DELETE — снять объявление с публикации (mode=stop, default) или полностью
// удалить из архива (mode=delete). Сначала пробуем cookies-flow, fallback —
// Puppeteer-job.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { itemId } = await params;
    const mode = (request.nextUrl.searchParams.get("mode") || "stop").toLowerCase();
    if (mode !== "stop" && mode !== "delete") {
      return NextResponse.json({ error: "mode должен быть stop или delete" }, { status: 400 });
    }

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

    // Путь 1: cookies-flow через BeduinUI
    const webSession = await getWebSessionById(session.id);
    if (webSession?.apiKey) {
      const r =
        mode === "delete"
          ? await deleteAvitoItemViaWeb(webSession, numericItemId)
          : await stopAvitoItemViaWeb(webSession, numericItemId);
      if (r.success) {
        if (mode === "delete") {
          await supabase
            .from("avito_items")
            .delete()
            .eq("session_id", session.id)
            .eq("avito_item_id", numericItemId);
        } else {
          // Avito переводит снятый с публикации item в «Архив» (shortcut=old).
          await supabase
            .from("avito_items")
            .update({ status: "old", updated_at: new Date().toISOString() })
            .eq("session_id", session.id)
            .eq("avito_item_id", numericItemId);
        }
        return NextResponse.json({ success: true, via: "cookies", mode, body: r.body.slice(0, 200) });
      }
      console.error(`[Avito ${mode}] cookies-flow failed:`, r.status, r.error, r.body.slice(0, 200));
      if (r.status > 0) {
        let msg = r.error || (mode === "delete" ? "Не удалось удалить" : "Не удалось снять с публикации");
        try {
          const parsed = JSON.parse(r.body);
          if (parsed?.result?.message) msg = String(parsed.result.message);
          else if (parsed?.message) msg = String(parsed.message);
        } catch {}
        return NextResponse.json(
          { error: `Avito: ${msg}`, status: r.status, body: r.body.slice(0, 300) },
          { status: 502 }
        );
      }
    }

    // Путь 2: fallback на Puppeteer-job (если apiKey нет или cookies-flow умер)
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

    return NextResponse.json({ success: true, via: "puppeteer-job", jobId, queued: true });
  } catch (error) {
    console.error("Avito item delete error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

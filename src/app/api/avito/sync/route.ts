import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncAvitoUser, getWebSessionById } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";

// POST — ручная синхронизация данных из Avito (через web proxy)
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const resolved = sessionOrError;

    if (!resolved.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const webSession = await getWebSessionById(resolved.id);
    if (!webSession) {
      return NextResponse.json(
        { error: "Нет активной браузерной сессии. Переподключите аккаунт." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const result = await syncAvitoUser({
      session: webSession,
      userId,
      supabase,
      sessionId: resolved.id,
    });

    // Обновляем last_sync_at
    await supabase
      .from("avito_browser_sessions")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", resolved.id);

    return NextResponse.json({
      success: true,
      synced: { items: result.items, chats: result.chats },
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Avito sync error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

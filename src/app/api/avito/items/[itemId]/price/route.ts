import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createAvitoClientForSession, getWebSessionById } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { updateAvitoItemPriceViaWeb, fetchAvitoApiKey } from "@/lib/avito/web-client";
import { z } from "zod";

const priceSchema = z.object({
  price: z.number().positive().max(999999999),
});

// POST — обновить цену объявления.
// Сначала пробуем cookies-flow (m.avito.ru/api/19/profile/item/{id}/edit) — он
// не требует OAuth-подписки. Если у сессии нет OAuth-credentials, это
// единственный вариант. Если cookies-flow упал и OAuth есть — fallback на него.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = await getUserIdFromSession(request);
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
    const newPrice = parsed.data.price;

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const webSession = await getWebSessionById(session.id);

    // ── Путь 1: cookies-flow через BeduinUI ──
    if (webSession) {
      // Если apiKey отсутствует — пробуем извлечь из HTML /orders.
      if (!webSession.apiKey) {
        const extracted = await fetchAvitoApiKey(webSession);
        if (extracted) {
          webSession.apiKey = extracted;
          await supabase
            .from("avito_browser_sessions")
            .update({ api_key: extracted })
            .eq("id", session.id);
        }
      }

      if (webSession.apiKey) {
        const r = await updateAvitoItemPriceViaWeb(webSession, numericItemId, newPrice);
        if (r.success) {
          await supabase
            .from("avito_items")
            .update({ price: newPrice, updated_at: new Date().toISOString() })
            .eq("session_id", session.id)
            .eq("avito_item_id", numericItemId);
          return NextResponse.json({ success: true, via: "cookies", body: r.body.slice(0, 200) });
        }
        console.error("[Avito Price cookies-flow] failed:", r.status, r.error, r.body.slice(0, 200));
        // Если cookies-flow дошёл до Avito (status > 0), возвращаем его ошибку
        // — иначе пробуем OAuth-fallback.
        if (r.status > 0) {
          // Пытаемся извлечь короткий текст из JSON {"result":{"message":"..."}}
          let msg = r.error || "Не удалось обновить цену";
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
      } else {
        console.error("[Avito Price] no apiKey on session (extract failed)");
      }
    }

    // ── Путь 2: OAuth-клиент (для тех у кого есть подписка Avito) ──
    const client = await createAvitoClientForSession(session.id);
    if (!client) {
      return NextResponse.json(
        {
          error:
            "Не удалось обновить цену: сессия не имеет ни apiKey (BeduinUI), ни OAuth-credentials. Переподключите аккаунт.",
        },
        { status: 502 }
      );
    }

    const result = await client.updateItemPrice(numericItemId, newPrice);
    if (!result.success) {
      console.error("[Avito Price OAuth] Error:", result.error);
      return NextResponse.json({ error: "Не удалось обновить цену" }, { status: 502 });
    }

    await supabase
      .from("avito_items")
      .update({ price: newPrice, updated_at: new Date().toISOString() })
      .eq("session_id", session.id)
      .eq("avito_item_id", numericItemId);

    return NextResponse.json({ success: true, via: "oauth", data: result.data });
  } catch (error) {
    console.error("Avito update price error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

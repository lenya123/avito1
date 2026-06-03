import { NextRequest, NextResponse } from "next/server";
import { createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { enqueueProductCoverBatch } from "@/lib/jobs/queues";
import { moscowToday } from "@/lib/utils/moscow-time";
import { z } from "zod";

const schema = z.object({ productId: z.string().uuid() });

// POST — ручной триггер «Сгенерить сейчас»: ставит батч из 5 AI-обложек для товара.
// Ограничение 1×/24ч обеспечивается дневным счётчиком avito_ai_gen_counters
// (тот же, что у ночного крона) — если сегодня уже генерили, отдаём 429.
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    const { productId } = parsed.data;

    const loose = createServiceClientLoose();

    // Уже генерили сегодня (крон или ручная кнопка)? — 1 запуск в сутки.
    const { count: usedToday } = await loose
      .from("avito_ai_gen_counters")
      .select("product_id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("gen_date", moscowToday());
    if ((usedToday ?? 0) > 0) {
      return NextResponse.json(
        { error: "Сегодня уже генерировали для этого товара. Попробуйте завтра." },
        { status: 429 }
      );
    }

    // Должен быть живой фотосет.
    const { count: photoset } = await loose
      .from("avito_media_presets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("kind", "photoset")
      .eq("is_active", true);
    if (!photoset) {
      return NextResponse.json(
        { error: "Сначала загрузите живой фотосет товара — генерировать не из чего." },
        { status: 400 }
      );
    }

    // Получатель: cover_tg_chat_id товара. БЕЗ дефолта на владельца — если получатель не
    // привязан, генерировать некому слать → не запускаем (см. также UI: кнопка скрыта).
    const { data: product } = await loose
      .from("products")
      .select("cover_tg_chat_id")
      .eq("id", productId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatId = ((product as any)?.cover_tg_chat_id as number | null) ?? null;
    if (chatId == null) {
      return NextResponse.json(
        { error: "Сначала укажите и сохраните Telegram chat_id получателя обложек." },
        { status: 400 }
      );
    }

    await enqueueProductCoverBatch(userId, productId, chatId);

    return NextResponse.json({ success: true, queued: 5 });
  } catch (e) {
    console.error("[avito/listings/generate-now] POST error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

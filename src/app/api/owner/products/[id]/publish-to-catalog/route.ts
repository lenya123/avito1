/**
 * POST /api/owner/products/[id]/publish-to-catalog
 *
 * Публикует карточку товара в Telegram-канал каталога. Постит
 * customer-bot (он же используется для группы заказов) — должен быть
 * админом канала.
 *
 * Принимает:
 *  - caption: string — текст подписи (можно HTML тэги: b/i/code/a)
 *  - photoIndices: number[] — индексы фото из products.photo_urls в нужном
 *    порядке. Первое идёт с caption, остальные без. Лимит Telegram —
 *    10 фото в media-group; >10 обрезаем.
 *
 * Не трекает message_id — каждое нажатие создаёт новый пост в канале.
 * Старые посты владелец удаляет вручную в Telegram если нужно.
 */

import { NextRequest, NextResponse } from "next/server";
import { Bot } from "grammy";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

interface PublishBody {
  caption?: string;
  photoIndices?: number[];
}

const MAX_MEDIA_GROUP = 10;
const MAX_CAPTION = 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as PublishBody;
  const caption = (body.caption ?? "").trim();
  const photoIndices = Array.isArray(body.photoIndices) ? body.photoIndices : [];

  if (!caption) {
    return NextResponse.json({ error: "Текст поста пустой" }, { status: 400 });
  }
  if (caption.length > MAX_CAPTION) {
    return NextResponse.json(
      { error: `Текст слишком длинный (макс ${MAX_CAPTION} символов)` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const [{ data: product }, { data: settings }] = await Promise.all([
    supabase.from("products").select("id, name, photo_urls").eq("id", id).maybeSingle(),
    supabase.from("business_settings").select("catalog_channel_id").limit(1).maybeSingle(),
  ]);

  if (!product) {
    return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  }

  const channelId = (settings?.catalog_channel_id as string | null) ?? null;
  if (!channelId) {
    return NextResponse.json(
      {
        error:
          "Канал каталога не настроен. Укажи catalog_channel_id в business_settings (chat_id канала, бот должен быть админом).",
      },
      { status: 400 }
    );
  }

  const allPhotos = (product.photo_urls as string[] | null) ?? [];
  const orderedPhotos = (photoIndices.length > 0 ? photoIndices : allPhotos.map((_, i) => i))
    .map((i) => allPhotos[i])
    .filter((url): url is string => Boolean(url))
    .slice(0, MAX_MEDIA_GROUP);

  const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_CUSTOMER_BOT_TOKEN не задан в окружении" },
      { status: 500 }
    );
  }

  const chatId = /^-?\d+$/.test(channelId) ? Number(channelId) : channelId;
  const bot = new Bot(token);

  try {
    if (orderedPhotos.length === 0) {
      await bot.api.sendMessage(chatId, caption, { parse_mode: "HTML" });
    } else if (orderedPhotos.length === 1) {
      await bot.api.sendPhoto(chatId, orderedPhotos[0], {
        caption,
        parse_mode: "HTML",
      });
    } else {
      const media = orderedPhotos.map((url, i) => ({
        type: "photo" as const,
        media: url,
        ...(i === 0 ? { caption, parse_mode: "HTML" as const } : {}),
      }));
      await bot.api.sendMediaGroup(chatId, media);
    }
  } catch (err) {
    console.error("[publish-to-catalog] Telegram send failed:", err);
    const reason = err instanceof Error ? err.message : "Telegram API error";
    return NextResponse.json({ error: `Не удалось опубликовать: ${reason}` }, { status: 502 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "product_published_to_catalog",
    entity_type: "product",
    entity_id: id,
    details: {
      product_name: product.name,
      photo_count: orderedPhotos.length,
      channel_id: channelId,
    },
  });

  return NextResponse.json({ success: true, photoCount: orderedPhotos.length });
}

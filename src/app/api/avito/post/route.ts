import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { scheduleAvitoPostListing } from "@/lib/jobs/queues";
import { mixPhotos } from "@/lib/avito/photo-mixer";
import { randomRingMetro } from "@/lib/constants/moscow-metro";
import { z } from "zod";

const BUCKET = "avito-presets";

const createSchema = z.object({
  productId: z.string().uuid().optional(),
  title: z.string().min(3).max(120),
  price: z.number().positive().max(99999999),
  description: z.string().max(5000).optional(),
  city: z.string().max(120).optional(),
  // Ручной выбор фото (NULL/отсутствует = авто/лестница).
  // nullish (optional+nullable): авто-режим в модалке шлёт явный null —
  // .optional() его отклонял → 400 «Проверьте название и цену» ещё до проверки сессии.
  manualSetKey: z.string().max(200).nullish(),
  manualCoverPresetId: z.string().uuid().nullish(),
  // Сохранить описание обратно в карточку товара (заполненный шаблон).
  saveDescriptionToProduct: z.boolean().optional(),
});

// POST — создать заявку автопостинга (флоу «создать объявление»)
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Проверьте название и цену", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;
    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const loose = createServiceClientLoose();

    // Город: из товара (// STUB: owner-panel) → иначе Москва. Заодно берём фото товара
    // (фолбэк-генерация обложки при пустом банке).
    let city = parsed.data.city || "Москва";
    let productPhotoUrls: string[] = [];
    if (parsed.data.productId) {
      const { data: product } = await loose
        .from("products")
        .select("city, photo_urls")
        .eq("id", parsed.data.productId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = product as any;
      if (p?.city) city = p.city;
      if (Array.isArray(p?.photo_urls)) productPhotoUrls = p.photo_urls as string[];
    }

    // Заполненный шаблон описания сохраняем обратно в карточку товара,
    // чтобы при следующих объявлениях из него генерился уникальный текст.
    if (parsed.data.saveDescriptionToProduct && parsed.data.productId && parsed.data.description) {
      await loose
        .from("products")
        .update({ description: parsed.data.description })
        .eq("id", parsed.data.productId);
    }

    // ─── Variant A: синхронно миксуем + уникализируем 10 фото (UI ждёт «уникализируем…»),
    // заливаем готовые в сторадж; воркер возьмёт их (prepared_images), не пере-микшируя. ───
    const mixed = await mixPhotos(userId, parsed.data.productId ?? "", productPhotoUrls, {
      manualSetKey: parsed.data.manualSetKey ?? null,
      manualCoverPresetId: parsed.data.manualCoverPresetId ?? null,
    });
    if (mixed.buffers.length === 0) {
      return NextResponse.json(
        { error: "Нет фото для публикации — загрузите живой фотосет товара" },
        { status: 400 }
      );
    }
    const batchId = randomUUID();
    const storage = createServiceClient().storage.from(BUCKET);
    const uploaded: string[] = [];
    await Promise.all(
      mixed.buffers.map(async (buf, i) => {
        const path = `${userId}/publish/${batchId}/${String(i).padStart(2, "0")}.jpg`;
        const { error: upErr } = await storage.upload(path, buf, {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (!upErr) uploaded[i] = path;
      })
    );
    const preparedPaths = uploaded.filter(Boolean);
    if (preparedPaths.length === 0) {
      return NextResponse.json({ error: "Не удалось подготовить фото" }, { status: 500 });
    }
    const preparedImages = {
      paths: preparedPaths,
      coverPresetId: mixed.coverPresetId,
      photosetSetKey: mixed.photosetSetKey,
      coverGenerated: mixed.coverGenerated,
      plan: mixed.plan,
    };

    const { data: jobRow, error } = await loose
      .from("avito_post_jobs")
      .insert({
        user_id: userId,
        session_id: session.id,
        product_id: parsed.data.productId ?? null,
        title: parsed.data.title,
        price: parsed.data.price,
        city,
        // Дефолтное метро (кольцо) ставим сразу как fallback; финальную
        // локацию/адрес хендлер может пересчитать на момент публикации
        // (resolveListingLocation): Москва-кольцо / Питер / др. город.
        metro: randomRingMetro(),
        description: parsed.data.description ?? null,
        manual_set_key: parsed.data.manualSetKey ?? null,
        manual_cover_preset_id: parsed.data.manualCoverPresetId ?? null,
        prepared_images: preparedImages,
        photo_plan: mixed.plan,
        status: "queued",
      })
      .select("id")
      .single();

    if (error || !jobRow) {
      console.error("[avito/post] insert error:", error);
      return NextResponse.json({ error: "Не удалось создать заявку" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postJobId = (jobRow as any).id as string;
    await scheduleAvitoPostListing(postJobId);

    return NextResponse.json({ success: true, jobId: postJobId, queued: true });
  } catch (e) {
    console.error("avito post create error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// GET — последние заявки автопостинга (для статуса на странице «Создать»)
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const loose = createServiceClientLoose();
    const { data } = await loose
      .from("avito_post_jobs")
      .select(
        "id, title, price, status, city, metro, avito_item_url, error_message, created_at, published_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ jobs: data ?? [] });
  } catch (e) {
    console.error("avito post list error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

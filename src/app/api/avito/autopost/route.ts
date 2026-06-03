/**
 * POST /api/avito/autopost
 *
 * Создание объявления на Avito через автопостинг.
 *
 * Поток (по ТЗ):
 * 1. Берём product из БД (location_city, photo_urls, category, description)
 * 2. Обложка:
 *    - Gemini генерирует из фото товара, ИЛИ
 *    - Берём рандомную из avito_cover_presets по категории
 * 3. Фотосет:
 *    - Рандомный avito_photoset_preset по категории (живые фото с инета)
 *    - Миксуется с фото товара
 * 4. Uniquizer прогоняет ВСЁ через resize/quality jitter
 * 5. Описание — OpenAI по системному промту (если не передано)
 * 6. Сохраняем готовые фото в Supabase Storage (avito-autopost)
 * 7. POST на Avito — ЗАГЛУШКА (нужен прокси для перехвата /items/add endpoint)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { getWebSessionForUser } from "@/lib/avito";
import { generateCoverFromUrl } from "@/lib/ai/gemini-cover";
import { uniquizeFromUrl } from "@/lib/ai/photo-uniquizer";

const autopostSchema = z.object({
  productId: z.string().uuid().optional(),
  title: z.string().min(1, "Название обязательно").max(100, "Макс 100 символов"),
  price: z.number().int().min(1, "Цена обязательна"),
  description: z.string().optional(),
  city: z.string().optional(),
  coverMode: z.enum(["gemini", "preset", "none"]).optional().default("gemini"),
  usePhotosetPreset: z.boolean().optional().default(true),
  uniquizePhotos: z.boolean().optional().default(true),
});

const BROWN_LINE_METROS = [
  "Парк культуры", "Октябрьская", "Добрынинская", "Павелецкая", "Таганская",
  "Курская", "Комсомольская", "Проспект Мира", "Новослободская", "Белорусская",
  "Краснопресненская", "Киевская",
];

function pickRandomMetro(): string {
  return BROWN_LINE_METROS[Math.floor(Math.random() * BROWN_LINE_METROS.length)];
}

function pickRandom<T>(arr: T[]): T | null {
  return arr.length === 0 ? null : arr[Math.floor(Math.random() * arr.length)];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadToStorage(supabase: any, path: string, buffer: Buffer, mimeType: string) {
  const { error } = await supabase.storage
    .from("avito-autopost")
    .upload(path, buffer, { contentType: mimeType, upsert: true });
  if (error) {
    console.error("[autopost] Storage upload error:", error.message);
    return null;
  }
  const { data } = supabase.storage.from("avito-autopost").getPublicUrl(path);
  return data.publicUrl as string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = autopostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { productId, title, price, description, city, coverMode, usePhotosetPreset, uniquizePhotos } =
      parsed.data;

    const supabase = createServiceClient();

    // Подтягиваем product
    let product: {
      id: string;
      name: string;
      description: string | null;
      category: string | null;
      location_city: string;
      photo_urls: string[] | null;
    } | null = null;
    if (productId) {
      const { data } = await supabase
        .from("products")
        .select("id, name, description, category, location_city, photo_urls")
        .eq("id", productId)
        .single();
      product = data;
    }

    // Проверяем web сессию
    const webSession = await getWebSessionForUser(userId);
    if (!webSession) {
      return NextResponse.json(
        { error: "Нет активной браузерной сессии Avito. Подключите аккаунт." },
        { status: 400 }
      );
    }

    const cityToUse = city || product?.location_city || "Москва";
    const metro = cityToUse === "Москва" ? pickRandomMetro() : null;
    const category = product?.category || null;

    // Подтягиваем пресеты по категории (с fallback на любые)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [coverPresetsRes, photosetPresetsRes] = await Promise.all([
      category
        ? sb.from("avito_cover_presets").select("photo_url").eq("category", category)
        : sb.from("avito_cover_presets").select("photo_url"),
      category
        ? sb
            .from("avito_photoset_presets")
            .select("name, photo_urls")
            .eq("category", category)
        : sb.from("avito_photoset_presets").select("name, photo_urls"),
    ]);

    const coverPresets: Array<{ photo_url: string }> = coverPresetsRes.data || [];
    const photosetPresets: Array<{ name: string; photo_urls: string[] }> =
      photosetPresetsRes.data || [];

    const processedPhotos: Array<{ url: string; source: string }> = [];
    const photoErrors: string[] = [];
    const timestamp = Date.now();
    const productPhotoUrls = product?.photo_urls || [];

    // 1. ОБЛОЖКА
    if (coverMode === "gemini" && productPhotoUrls.length > 0) {
      const coverResult = await generateCoverFromUrl(productPhotoUrls[0], product?.name);
      if (coverResult.success && coverResult.imageBase64) {
        const buf = Buffer.from(coverResult.imageBase64, "base64");
        const path = `${userId}/${timestamp}/cover-gemini.${coverResult.mimeType?.split("/")[1] || "png"}`;
        const url = await uploadToStorage(supabase, path, buf, coverResult.mimeType || "image/png");
        if (url) processedPhotos.push({ url, source: "cover-gemini" });
      } else if (coverResult.error) {
        photoErrors.push(`Cover (Gemini): ${coverResult.error}`);
        // Fallback на пресет
        const fallback = pickRandom(coverPresets);
        if (fallback) {
          const uniq = await uniquizeFromUrl(fallback.photo_url, "medium");
          if (uniq.success && uniq.buffer) {
            const path = `${userId}/${timestamp}/cover-preset.jpg`;
            const url = await uploadToStorage(supabase, path, uniq.buffer, "image/jpeg");
            if (url) processedPhotos.push({ url, source: "cover-preset-fallback" });
          }
        }
      }
    } else if (coverMode === "preset") {
      const preset = pickRandom(coverPresets);
      if (preset) {
        const uniq = await uniquizeFromUrl(preset.photo_url, "medium");
        if (uniq.success && uniq.buffer) {
          const path = `${userId}/${timestamp}/cover-preset.jpg`;
          const url = await uploadToStorage(supabase, path, uniq.buffer, "image/jpeg");
          if (url) processedPhotos.push({ url, source: "cover-preset" });
        }
      } else {
        photoErrors.push("Нет пресетов обложек для этой категории");
      }
    }

    // 2. ФОТОСЕТ: либо из пресетов, либо из товара
    let photosToProcess: string[] = [];
    let photosetName: string | null = null;
    if (usePhotosetPreset && photosetPresets.length > 0) {
      const preset = pickRandom(photosetPresets);
      if (preset) {
        photosToProcess = preset.photo_urls;
        photosetName = preset.name;
      }
    }
    // Fallback или если usePhotosetPreset=false — используем фото товара
    if (photosToProcess.length === 0) {
      photosToProcess = productPhotoUrls;
    }

    // 3. УНИКАЛИЗАЦИЯ всех фотосета
    if (photosToProcess.length > 0) {
      for (let i = 0; i < photosToProcess.length; i++) {
        if (uniquizePhotos) {
          const result = await uniquizeFromUrl(photosToProcess[i], "medium");
          if (result.success && result.buffer) {
            const path = `${userId}/${timestamp}/photo-${i + 1}.jpg`;
            const url = await uploadToStorage(supabase, path, result.buffer, "image/jpeg");
            if (url) processedPhotos.push({ url, source: photosetName ? `preset-${i + 1}` : `product-${i + 1}` });
          } else if (result.error) {
            photoErrors.push(`Photo ${i + 1}: ${result.error}`);
          }
        } else {
          processedPhotos.push({
            url: photosToProcess[i],
            source: photosetName ? `preset-${i + 1}-raw` : `product-${i + 1}-raw`,
          });
        }
      }
    }

    const finalDescription = description || product?.description || "";

    return NextResponse.json({
      success: true,
      message:
        "Объявление подготовлено. Фактический постинг включится после интеграции с прокси и перехвата endpoint /items/add.",
      draft: {
        user_id: userId,
        title,
        price,
        description: finalDescription,
        product_id: productId || null,
        category,
        city: cityToUse,
        metro,
        status: "draft",
        created_at: new Date().toISOString(),
      },
      processedPhotos,
      photoErrors,
      meta: {
        coverSource: coverMode,
        photosetSource: photosetName ? `preset:${photosetName}` : "product",
        coverPresetsAvailable: coverPresets.length,
        photosetPresetsAvailable: photosetPresets.length,
      },
      stepsPlanned: [
        `1. Категория товара: ${category || "не указана"}`,
        `2. Обложка: ${coverMode === "gemini" ? "Gemini nano-banana" : coverMode === "preset" ? `пресет (${coverPresets.length} доступно)` : "выкл"}`,
        `3. Фотосет: ${photosetName ? `пресет "${photosetName}"` : "фото товара"} (${photosToProcess.length} шт.)`,
        `4. Уникализация: ${uniquizePhotos ? "вкл" : "выкл"}`,
        `5. POST на avito.ru/items/add (город: ${cityToUse}${metro ? `, метро: ${metro}` : ""}) — ЗАГЛУШКА`,
      ],
    });
  } catch (error) {
    console.error("Avito autopost error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

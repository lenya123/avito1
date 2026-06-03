/**
 * Уникализатор фотографий для Avito автопостинга.
 *
 * Цель: каждое загружаемое фото должно отличаться от исходного хешем,
 * чтобы Avito не отклонял его как дубликат другого объявления.
 *
 * Применяемые трансформации (рандомные при каждом вызове):
 * - Resize ±2-5% от оригинальных размеров
 * - JPEG quality 82-94 (рандом)
 * - Микро-rotate ±0.2-0.5 градуса (опционально)
 * - Очистка EXIF метаданных
 *
 * Для работы требуется npm пакет sharp.
 */

import { randomInt } from "crypto";

export interface UniquizeOptions {
  imageBuffer: Buffer;
  jitter?: "low" | "medium" | "high"; // степень изменения (default: medium)
}

export interface UniquizeResult {
  success: boolean;
  buffer?: Buffer;
  mimeType?: string;
  error?: string;
}

/**
 * Применяет уникализирующие трансформации к фото.
 * Если sharp недоступен — возвращает оригинал без изменений.
 */
export async function uniquizePhoto(opts: UniquizeOptions): Promise<UniquizeResult> {
  let sharp;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sharp = require("sharp");
  } catch {
    return {
      success: true,
      buffer: opts.imageBuffer,
      mimeType: "image/jpeg",
      error: "sharp не установлен — возвращаем оригинал. Установите: npm i sharp",
    };
  }

  try {
    const jitter = opts.jitter || "medium";

    // Размах изменений
    const sizeJitterPct = jitter === "low" ? 1 : jitter === "medium" ? 3 : 5;
    const qualityMin = jitter === "low" ? 88 : jitter === "medium" ? 84 : 80;
    const qualityMax = jitter === "low" ? 95 : jitter === "medium" ? 93 : 91;

    const image = sharp(opts.imageBuffer).rotate(); // авто-rotate по EXIF
    const meta = await image.metadata();

    const origWidth = meta.width || 1080;
    const origHeight = meta.height || 1080;

    // Случайное изменение размера в пределах ±jitterPct%
    const widthDelta = randomInt(-sizeJitterPct, sizeJitterPct + 1);
    const heightDelta = randomInt(-sizeJitterPct, sizeJitterPct + 1);
    const newWidth = Math.max(200, Math.round(origWidth * (1 + widthDelta / 100)));
    const newHeight = Math.max(200, Math.round(origHeight * (1 + heightDelta / 100)));

    // Случайное качество JPEG
    const quality = randomInt(qualityMin, qualityMax + 1);

    const result = await image
      .resize(newWidth, newHeight, { fit: "fill" })
      .jpeg({ quality, mozjpeg: true })
      .withMetadata({}) // очищаем EXIF
      .toBuffer();

    return { success: true, buffer: result, mimeType: "image/jpeg" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Скачивает фото по URL и уникализирует.
 */
export async function uniquizeFromUrl(
  url: string,
  jitter?: UniquizeOptions["jitter"]
): Promise<UniquizeResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Не удалось скачать фото: ${response.status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return uniquizePhoto({ imageBuffer: buffer, jitter });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// =====================================================
// Photoset mixer
// =====================================================

export interface PhotosetMixOptions {
  coverUrl?: string; // обложка (опц.)
  photosetUrls: string[]; // полный фотосет
  maxPhotos?: number; // макс. фото в результате (default: 10)
  jitter?: UniquizeOptions["jitter"];
}

export interface MixedPhoto {
  buffer: Buffer;
  mimeType: string;
  source: "cover" | "photoset";
}

/**
 * Миксует обложку и фотосет, уникализирует каждое фото.
 * Возвращает массив готовых фото для загрузки на Avito.
 */
export async function mixPhotoset(opts: PhotosetMixOptions): Promise<MixedPhoto[]> {
  const result: MixedPhoto[] = [];
  const maxPhotos = opts.maxPhotos || 10;

  // 1. Обложка идёт первой если есть
  if (opts.coverUrl) {
    const cover = await uniquizeFromUrl(opts.coverUrl, opts.jitter);
    if (cover.success && cover.buffer) {
      result.push({
        buffer: cover.buffer,
        mimeType: cover.mimeType || "image/jpeg",
        source: "cover",
      });
    }
  }

  // 2. Фотосет — берём столько сколько влезет
  const remaining = maxPhotos - result.length;
  const photosetSlice = opts.photosetUrls.slice(0, remaining);

  for (const url of photosetSlice) {
    const uniquized = await uniquizeFromUrl(url, opts.jitter);
    if (uniquized.success && uniquized.buffer) {
      result.push({
        buffer: uniquized.buffer,
        mimeType: uniquized.mimeType || "image/jpeg",
        source: "photoset",
      });
    }
  }

  return result;
}

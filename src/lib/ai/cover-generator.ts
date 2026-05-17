/**
 * Генератор обложек объявления через Google Gemini «Nano Banana»
 * (gemini-2.5-flash-image). На вход — фото товара, на выход — выверенная
 * «продающая» обложка по системному промту.
 *
 * Без GEMINI_API_KEY → pass-through: возвращаем исходное фото товара
 * (аккуратная заглушка, флоу не падает). // ключи позже.
 */
import { features, NANO_BANANA_MODEL } from "@/lib/config/features";

/** Системный промт обложки. Вынесен — легко выверять отдельно. */
export const COVER_SYSTEM_PROMPT = `Ты — дизайнер карточек товара для маркетплейса Avito.
Сделай чистую продающую обложку на основе предоставленного фото товара:
— товар крупно, по центру, в фокусе; лишний фон убрать/заменить на мягкий нейтральный градиент;
— естественное освещение, аккуратные тени, без пластикового пережатого вида;
— без текста, логотипов, водяных знаков, рамок и коллажей;
— реалистично, как живое фото, а не рендер; пропорции и цвет товара не искажать;
— формат вертикальный 4:5, высокое качество.`;

async function fetchAsBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

export interface CoverResult {
  buffer: Buffer;
  generated: boolean; // true — сгенерировано Nano Banana, false — pass-through
  mime: string;
}

/**
 * Сгенерировать обложку из фото товара.
 * @param productPhotoUrls — URL фото товара (берём первое валидное как основу)
 * @param extraPrompt — доп. инструкции (напр. категория/цвет)
 */
export async function generateCover(
  productPhotoUrls: string[],
  extraPrompt?: string
): Promise<CoverResult | null> {
  const firstUrl = productPhotoUrls.find(Boolean);
  if (!firstUrl) return null;

  const src = await fetchAsBase64(firstUrl);
  if (!src) return null;

  // Заглушка без ключа — отдаём исходное фото как обложку
  if (!features.hasGemini) {
    return { buffer: Buffer.from(src.data, "base64"), generated: false, mime: src.mime };
  }

  try {
    const prompt = extraPrompt
      ? `${COVER_SYSTEM_PROMPT}\n\nДоп. контекст: ${extraPrompt}`
      : COVER_SYSTEM_PROMPT;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${NANO_BANANA_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: src.mime, data: src.data } },
              ],
            },
          ],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      }
    );

    if (!res.ok) {
      console.error("[cover-generator] Gemini error:", res.status, await res.text());
      return { buffer: Buffer.from(src.data, "base64"), generated: false, mime: src.mime };
    }

    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p?.inlineData?.data);
    if (!imgPart) {
      return { buffer: Buffer.from(src.data, "base64"), generated: false, mime: src.mime };
    }

    return {
      buffer: Buffer.from(imgPart.inlineData.data, "base64"),
      generated: true,
      mime: imgPart.inlineData.mimeType || "image/png",
    };
  } catch (e) {
    console.error("[cover-generator] failed, pass-through:", e);
    return { buffer: Buffer.from(src.data, "base64"), generated: false, mime: src.mime };
  }
}

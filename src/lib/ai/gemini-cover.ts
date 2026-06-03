/**
 * Генерация красивых обложек для объявлений Avito через Gemini nano-banana.
 *
 * Принимает фото товара и генерирует студийную обложку через image-edit модель.
 * Системный промт нацелен на чистый светлый фон + минимализм + фокус на товар.
 *
 * Для работы требуется GEMINI_API_KEY в env.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// nano-banana = gemini-2.0-flash-exp с image editing
const COVER_MODEL = "gemini-2.0-flash-exp";

const COVER_SYSTEM_PROMPT = `Generate a clean studio-quality product cover image based on the input photo.
Requirements:
- Light neutral background (off-white, soft gradient or solid)
- Professional product photography lighting
- Sharp focus on the product, minor shadow under it
- Square or 4:3 aspect ratio
- No text overlays, no watermarks, no logos
- Subtle, premium aesthetic suitable for Avito marketplace listing
- Keep the exact product from the input - do not replace it or add anything
- High detail, photorealistic`;

export interface CoverGenerationOptions {
  imageBase64: string; // base64-encoded image
  mimeType: string; // image/jpeg | image/png
  productName?: string;
  additionalPrompt?: string;
}

export interface CoverGenerationResult {
  success: boolean;
  imageBase64?: string;
  mimeType?: string;
  error?: string;
}

/**
 * Генерирует обложку для товара через Gemini nano-banana.
 * Возвращает base64 PNG. Может вернуть null если API не сконфигурирован.
 */
export async function generateCover(opts: CoverGenerationOptions): Promise<CoverGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "GEMINI_API_KEY не задан. Обложка будет использовать оригинальное фото.",
    };
  }

  const prompt = [
    COVER_SYSTEM_PROMPT,
    opts.productName ? `Product: ${opts.productName}` : "",
    opts.additionalPrompt || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models/${COVER_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: opts.mimeType,
                    data: opts.imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
            temperature: 0.8,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { success: false, error: `Gemini API error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inline_data?.data) {
        return {
          success: true,
          imageBase64: part.inline_data.data,
          mimeType: part.inline_data.mime_type || "image/png",
        };
      }
    }

    return { success: false, error: "Gemini не вернул изображение" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Удобная обёртка — принимает URL фото, скачивает, генерирует обложку, возвращает Buffer.
 */
export async function generateCoverFromUrl(
  imageUrl: string,
  productName?: string
): Promise<CoverGenerationResult> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return { success: false, error: `Не удалось скачать фото: ${response.status}` };
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    return generateCover({ imageBase64: base64, mimeType, productName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

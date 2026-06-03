/**
 * AI-генерация фото объявления через Google Gemini «Nano Banana»
 * (gemini-2.5-flash-image), мульти-source: модель принимает несколько
 * изображений в одном `parts` и компонует из них одно фото.
 *
 * Три категории (ТЗ):
 *  • normal      — товар на живом фоне (асфальт/бетон/камни/горы/трава),
 *                  фон AI подбирает сам по визуалу; исходники — 3 живых фото;
 *  • photozone   — товар в готовой фотозоне; исходники — 1 фото фотозоны + 3 живых;
 *  • personality — товар в кадре с популярной личностью; 1 фото личности + 3 живых.
 *
 * Без GEMINI_API_KEY → pass-through: возвращаем первое живое фото
 * (аккуратная заглушка, флоу не падает).
 */
import sharp from "sharp";
import { features, NANO_BANANA_MODEL, geminiGenerateContent } from "@/lib/config/features";

export type AiPhotoCategory = "normal" | "photozone" | "personality";

export interface PhotoGenInput {
  /** 3 фото из живого фотосета товара (источник). */
  livePhotoUrls: string[];
  /** Варианты фотозон (для category='photozone'): подаём несколько, Gemini выберет лучшую. */
  referenceUrls?: string[] | null;
  category: AiPhotoCategory;
  /** Доп. контекст (напр. название/категория товара). */
  extraPrompt?: string;
}

export interface PhotoGenResult {
  buffer: Buffer;
  generated: boolean; // true — сгенерировано Gemini, false — pass-through
  mime: string;
}

/** Системные промты по категориям. Вынесены — легко выверять отдельно.
 *  Общий принцип: фото для ПРОДАЖИ на маркетплейсе → товар — герой кадра,
 *  максимальный фотореализм (как снято на камеру), товар переносим ТОЧНО. */
const QUALITY_RULES = `— ⚠️ ГЛАВНОЕ ПРАВИЛО — АБСОЛЮТНАЯ ВЕРНОСТЬ ТОВАРУ. Очень внимательно изучи исходные фото и
  перенеси САМ ТОВАР на 100% идентично: КАЖДУЮ деталь, ВСЕ надписи, логотипы, бренд-маркировку,
  тексты, цифры, символы, принты, узоры, строчку и швы, фактуру материала, ТОЧНЫЙ цвет и оттенок,
  форму и пропорции. НИЧЕГО не дорисовывай, не убирай, не «улучшай» и не искажай. Менять внешний
  вид товара, его надписи или логотипы — НЕДОПУСТИМО: это уже другой товар (брак). Если какая-то
  деталь не видна на исходных фото — НЕ выдумывай и не достраивай её.
— Бери из исходных фото ТОЛЬКО сам товар. Исходный фон, поверхность и окружение
  (ковёр, интерьер, зеркало, стол и т.п.) НЕ переноси — полностью замени их новой сценой по заданию.
— Снимок ДОЛЖЕН выглядеть как реальная фотография, снятая на камеру: естественный свет,
  мягкие натуральные тени, реальные текстуры и материалы, лёгкая глубина резкости.
  Это НЕ 3D-рендер, НЕ иллюстрация, НЕ CGI — фотореализм без артефактов и искажений.
— Не добавляй ЧУЖОЙ текст, водяные знаки, посторонние логотипы, рамки и коллажи — но все «родные»
  надписи и логотипы самого товара сохраняй в точности (запрет касается только добавленного извне).
— Вертикальный формат 4:5, высокое разрешение.`;

export const PHOTO_SYSTEM_PROMPTS: Record<AiPhotoCategory, string> = {
  normal: `Ты — профессиональный предметный фотограф для маркетплейса Avito.
На вход — живые фото одного ТОВАРА (одежда/обувь), который выставлен на ПРОДАЖУ.
Сделай ОДНО продающее фото для карточки объявления: товар должен выглядеть максимально
презентабельно, чисто и желанно, чтобы покупатель захотел его купить.
ГЛАВНОЕ — сам товар: он крупный, по центру внимания, идеально резкий и в фокусе.
Помести товар на естественный уличный фон, выгодно подающий вещь (асфальт, бетон, камень,
трава, песок) — фон приглушённый и НЕ отвлекает от товара.
${QUALITY_RULES}`,
  photozone: `Ты — профессиональный фотограф для маркетплейса Avito.
ПЕРВЫЕ изображения — это РАЗНЫЕ готовые фотозоны (фоны/интерьеры) на выбор. Остальные — живые фото
ТОВАРА, который продаётся. Сначала выбери ОДНУ фотозону, которая лучше всего подходит товару по стилю,
цвету и свету. Затем сделай ОДНО продающее фото: аккуратно и реалистично помести товар в выбранную фотозону.
Товар стоит/лежит на поверхности ЕСТЕСТВЕННО — он НЕ парит и не висит в воздухе, имеет правильные
контактные тени и реалистичный масштаб относительно сцены. ТОВАР — герой кадра: крупный, чистый, в фокусе.
${QUALITY_RULES}`,
  // «На модели»: вымышленный человек носит товар. Реальные/узнаваемые лица намеренно НЕ
  // используем — Gemini блокирует likeness (finishReason=IMAGE_OTHER) + это нарушает правила
  // Авито и право на изображение. Поэтому генерим собирательный несуществующий образ.
  personality: `Ты — профессиональный fashion-фотограф для маркетплейса Avito.
На вход — живые фото одного ТОВАРА (одежда/обувь), который продаётся.
Сделай ОДНО продающее фото для карточки объявления: ВЫМЫШЛЕННЫЙ, несуществующий собирательный
человек-модель (НЕ реальная, не узнаваемая личность и не знаменитость) демонстрирует этот товар на себе.
Кадрируй так, чтобы ТОВАР был показан максимально выгодно: для обуви — ноги/нижняя часть фигуры (можно в
движении), для одежды — корпус/фигура. Лицо показывать крупно НЕ нужно: модель может быть повёрнута,
лицо вне кадра, в профиль или обобщённое — это нормально и даже предпочтительно. Естественная поза,
стильная городская среда.
ГЛАВНОЕ — товар: он крупный, хорошо виден, в фокусе и презентабелен (акцент на товаре, а не на лице/фоне).
${QUALITY_RULES}`,
};

// Фолбэк для photozone, когда в библиотеке доступна ВСЕГО ОДНА зона: промт «выбери из
// разных» с одним вариантом Gemini ломает (0/4 в тесте) — поэтому отдельная формулировка.
const PHOTOZONE_SINGLE_PROMPT = `Ты — профессиональный фотограф для маркетплейса Avito.
ИЗОБРАЖЕНИЕ 1 — готовая фотозона (фон/интерьер). Остальные изображения — живые фото ТОВАРА, который продаётся.
Сделай ОДНО продающее фото: аккуратно и реалистично помести товар в эту фотозону.
Товар стоит/лежит на поверхности ЕСТЕСТВЕННО — он НЕ парит и не висит в воздухе, имеет правильные
контактные тени и реалистичный масштаб относительно сцены. ТОВАР — герой кадра: крупный, чистый, в фокусе.
${QUALITY_RULES}`;

async function fetchAsBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    // Нормализуем в JPEG: Gemini не принимает часть форматов (.avif/.webp) и на таких
    // входах отвечает 200 БЕЗ картинки (finishReason=IMAGE_OTHER). sharp унифицирует вход.
    const jpeg = await sharp(raw).rotate().jpeg({ quality: 90 }).toBuffer();
    return { data: jpeg.toString("base64"), mime: "image/jpeg" };
  } catch {
    return null;
  }
}

/**
 * Сгенерировать одно фото товара по категории.
 * Порядок изображений в промте: для photozone сначала идут ВАРИАНТЫ фотозон
 * (Gemini выбирает лучшую), затем до 3 живых фото товара. normal/personality — без зон.
 */
export async function generateProductPhoto(
  input: PhotoGenInput
): Promise<PhotoGenResult | null> {
  const live = input.livePhotoUrls.filter(Boolean).slice(0, 3);
  if (live.length === 0) return null;

  // Референс-зоны нужны только фотозоне (подаём несколько — Gemini выберет лучшую).
  // «personality» (на модели) и normal генерируют сцену/модель из промта, без зон.
  const needsReference = input.category === "photozone";
  const refUrls = needsReference ? (input.referenceUrls ?? []).filter(Boolean).slice(0, 3) : [];

  const refSources = (await Promise.all(refUrls.map((u) => fetchAsBase64(u)))).filter(
    (s): s is { data: string; mime: string } => !!s
  );
  const liveSources = (await Promise.all(live.map((u) => fetchAsBase64(u)))).filter(
    (s): s is { data: string; mime: string } => !!s
  );
  if (liveSources.length === 0) return null;

  // Порядок: сначала кандидаты-фотозоны, затем живые фото товара.
  const sources = [...refSources, ...liveSources];
  const firstLive = liveSources[0];

  // Без ключа — честный pass-through: отдаём первое живое фото (флоу не падает в dev).
  if (!features.hasGemini) {
    return { buffer: Buffer.from(firstLive.data, "base64"), generated: false, mime: firstLive.mime };
  }

  // photozone с 1 зоной → отдельный промт (мульти-промт «выбери из разных» на одном
  // варианте Gemini ломает). С ≥2 зонами — основной промт с выбором лучшей.
  const basePrompt =
    input.category === "photozone" && refSources.length < 2
      ? PHOTOZONE_SINGLE_PROMPT
      : PHOTO_SYSTEM_PROMPTS[input.category];
  const prompt = input.extraPrompt
    ? `${basePrompt}\n\nДоп. контекст: ${input.extraPrompt}`
    : basePrompt;

  // Одна попытка вызова Gemini. null — HTTP-ошибка или ответ без картинки.
  const attemptOnce = async (): Promise<PhotoGenResult | null> => {
    try {
      const gemini = geminiGenerateContent(NANO_BANANA_MODEL);
      const res = await fetch(gemini.url, {
          method: "POST",
          headers: gemini.headers,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  ...sources.map((s) => ({ inlineData: { mimeType: s.mime, data: s.data } })),
                ],
              },
            ],
            generationConfig: { responseModalities: ["IMAGE"] },
          }),
        }
      );

      if (!res.ok) {
        console.error("[photo-generator] Gemini HTTP error:", res.status, await res.text().catch(() => ""));
        return null; // НЕ подсовываем исходное фото как «генерацию» — пусть хендлер обработает провал
      }

      const json = await res.json();
      const cand = json?.candidates?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = cand?.content?.parts ?? [];
      const imgPart = parts.find((p) => p?.inlineData?.data);
      if (!imgPart) {
        // Gemini вернул 200 без картинки. Частые причины: safety-блок людей/лиц
        // (category=personality → finishReason=IMAGE_OTHER) или неподдержанный формат входа.
        console.warn(
          `[photo-generator] no image (category=${input.category}, finishReason=${cand?.finishReason}, ` +
            `block=${json?.promptFeedback?.blockReason ?? "—"})`
        );
        return null;
      }

      return {
        buffer: Buffer.from(imgPart.inlineData.data, "base64"),
        generated: true,
        mime: imgPart.inlineData.mimeType || "image/png",
      };
    } catch (e) {
      console.error("[photo-generator] request failed:", e);
      return null;
    }
  };

  // Ретраи: транзиентные «нет картинки» и сетевые сбои часто проходят со 2-й попытки (это и
  // давало «пришло 3 из 5»). «На модели» (personality) — самая капризная (Gemini периодически
  // блокирует людей), ей даём попыток больше.
  const maxAttempts = input.category === "personality" ? 3 : 2;
  for (let i = 1; i <= maxAttempts; i++) {
    const r = await attemptOnce();
    if (r) return r;
    if (i < maxAttempts) {
      console.warn(`[photo-generator] retry ${i + 1}/${maxAttempts} (category=${input.category})`);
    }
  }
  return null;
}

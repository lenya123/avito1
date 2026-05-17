/**
 * Фичефлаги по наличию ключей. Server-only (читает process.env).
 *
 * Поведение без ключей — аккуратные заглушки, а не падение:
 *  • нет OPENAI_API_KEY → генерация описаний/названий и чат-агент возвращают
 *    детерминированную заглушку из локального шаблона;
 *  • нет GEMINI_API_KEY → генератор обложек = pass-through (берёт исходное фото
 *    товара / случайную живую обложку без AI-обработки).
 */
export const features = {
  get hasOpenAI(): boolean {
    const k = process.env.OPENAI_API_KEY;
    return !!k && k !== "your-openai-api-key";
  },
  get hasGemini(): boolean {
    const k = process.env.GEMINI_API_KEY;
    return !!k && k !== "your-gemini-api-key";
  },
  get hasRedis(): boolean {
    return !!process.env.REDIS_URL;
  },
  get hasSupabase(): boolean {
    return (
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  },
} as const;

/** Модель Nano Banana для генерации/редактирования обложек. */
export const NANO_BANANA_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

/** Модели OpenAI. */
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
export const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
export const OPENAI_STT_MODEL = process.env.OPENAI_STT_MODEL || "whisper-1";
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

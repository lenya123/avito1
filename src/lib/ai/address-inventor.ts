/**
 * Придумать правдоподобный адрес в центре произвольного города — для локации
 * объявления Авито в городах без отдельной метро-логики (не Москва/Питер).
 * Авито показывает примерную точку, точный адрес не критичен.
 *
 * Без OPENAI_API_KEY → null (тогда постинг отдаёт только город, Авито геокодит сам).
 */
import OpenAI from "openai";
import { features, OPENAI_TEXT_MODEL } from "@/lib/config/features";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai)
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  return _openai;
}

const SYSTEM_PROMPT = `Ты знаешь географию городов России. Верни ОДИН правдоподобный
адрес в центре указанного города в формате «улица, дом» (без города, без индекса,
без комментариев). Улица должна реально существовать в центре города. Только адрес.`;

/** Адрес «улица, дом» в центре города или null. */
export async function inventCentralAddress(city: string): Promise<string | null> {
  const trimmed = city?.trim();
  if (!trimmed) return null;
  if (!features.hasOpenAI) return null;

  try {
    const res = await openai().chat.completions.create({
      model: OPENAI_TEXT_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Город: ${trimmed}` },
      ],
    });
    const raw = res.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    // Берём первую строку, чистим кавычки/точки по краям.
    const line = raw.split("\n")[0].replace(/^["'«»\s.]+|["'«»\s.]+$/g, "");
    return line || null;
  } catch (e) {
    console.error("[address-inventor] failed:", e);
    return null;
  }
}

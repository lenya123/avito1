/**
 * Генерация названия и описания объявления по карточке товара.
 * Системный промт выверен под Avito (живой, без воды, без запрещёнки).
 *
 * Без OPENAI_API_KEY → детерминированный шаблон-фолбэк (флоу не падает).
 */
import OpenAI from "openai";
import { features, OPENAI_TEXT_MODEL } from "@/lib/config/features";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  return _openai;
}

export interface ListingProductInput {
  name: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  price?: number | null;
  measurements?: Record<string, Record<string, number>> | null;
}

export const TITLE_SYSTEM_PROMPT = `Ты составляешь заголовки объявлений Avito.
Заголовок: 1 строка, до 50 символов, по-русски, естественно, как пишет живой продавец.
Без ЗАГЛАВНЫХ слов целиком, без эмодзи, без цены, без телефона, без ссылок,
без слов «продам/срочно/торг», без брендов-подделок. Только суть товара.
Верни ТОЛЬКО текст заголовка.`;

export const DESC_SYSTEM_PROMPT = `Ты пишешь описания объявлений Avito для продавца одежды/товаров.
Стиль: живой, человеческий, короткие абзацы, по делу. 600–1100 символов.
Структура: 1) что это и кому подойдёт; 2) ключевые характеристики/материал;
3) размеры/замеры если есть; 4) состояние/отправка одной строкой.
Запрещено: эмодзи-спам, КАПС, цена, телефоны, ссылки, обещания «оригинал/люкс»,
вода и штампы. Пиши так, будто реально продаёшь свою вещь. Верни ТОЛЬКО текст описания.`;

function productBrief(p: ListingProductInput): string {
  const lines = [`Товар: ${p.name}`];
  if (p.brand) lines.push(`Бренд/линейка: ${p.brand}`);
  if (p.category) lines.push(`Категория: ${p.category}`);
  if (p.price) lines.push(`Цена: ${p.price} ₽`);
  if (p.description) lines.push(`Исходное описание: ${p.description}`);
  if (p.measurements && Object.keys(p.measurements).length) {
    lines.push(`Замеры: ${JSON.stringify(p.measurements)}`);
  }
  return lines.join("\n");
}

export async function generateTitle(p: ListingProductInput): Promise<string> {
  if (!features.hasOpenAI) {
    const base = [p.name, p.brand].filter(Boolean).join(" ");
    return base.slice(0, 50);
  }
  const res = await openai().chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.8,
    messages: [
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      { role: "user", content: productBrief(p) },
    ],
  });
  const t = res.choices[0]?.message?.content?.trim() || p.name;
  return t.replace(/^["'«»]+|["'«»]+$/g, "").slice(0, 50);
}

export async function generateDescription(p: ListingProductInput): Promise<string> {
  if (!features.hasOpenAI) {
    const parts = [
      p.description || `${p.name}.`,
      p.measurements && Object.keys(p.measurements).length
        ? `Замеры: ${Object.entries(p.measurements)
            .map(([k, v]) => `${k} — ${Object.entries(v).map(([a, b]) => `${a} ${b}`).join(", ")}`)
            .join("; ")}.`
        : "",
      "Отправка по России. Пишите по любым вопросам.",
    ].filter(Boolean);
    return parts.join("\n\n");
  }
  const res = await openai().chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.7,
    messages: [
      { role: "system", content: DESC_SYSTEM_PROMPT },
      { role: "user", content: productBrief(p) },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || p.description || p.name;
}

export async function generateListingContent(
  p: ListingProductInput
): Promise<{ title: string; description: string }> {
  const [title, description] = await Promise.all([
    generateTitle(p),
    generateDescription(p),
  ]);
  return { title, description };
}

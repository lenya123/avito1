/**
 * POST /api/avito/autopost/generate
 *
 * Генерация заголовка и/или описания для Avito объявления через OpenAI.
 * Принимает: { productName?, productDescription?, kind: "title" | "description" }
 * Возвращает: { text }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

const generateSchema = z.object({
  productName: z.string().optional(),
  productDescription: z.string().optional(),
  kind: z.enum(["title", "description"]),
});

const SYSTEM_PROMPT_TITLE = `Ты копирайтер для объявлений на Avito. Создай короткий цепляющий заголовок (макс 50 символов) на русском языке. Без воды, без эмодзи, только суть товара. Можно добавить бренд/модель если есть.`;

const SYSTEM_PROMPT_DESCRIPTION = `Ты копирайтер для объявлений на Avito. Создай продающее описание товара на русском языке.
Правила:
- 3-5 коротких абзацев
- Конкретика: материал, состояние, размеры
- Подчеркни выгоду покупателя
- Без воды и шаблонных фраз
- В конце призыв к действию (например: "Пишите, отвечу быстро")
- Без эмодзи в большом количестве (1-2 максимум)
- Без капса`;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { productName, productDescription, kind } = parsed.data;

    const systemPrompt = kind === "title" ? SYSTEM_PROMPT_TITLE : SYSTEM_PROMPT_DESCRIPTION;
    const userInput = [
      productName ? `Товар: ${productName}` : "",
      productDescription ? `Описание: ${productDescription}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput || "Создай объявление для товара" },
      ],
      max_tokens: kind === "title" ? 60 : 400,
      temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content?.trim() || "";
    if (!text) {
      return NextResponse.json({ error: "Не удалось сгенерировать" }, { status: 500 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Avito autopost generate error:", error);
    return NextResponse.json({ error: "Ошибка генерации" }, { status: 500 });
  }
}

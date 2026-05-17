/**
 * AI-агент продаж для Avito
 *
 * Отличия от support-agent.ts:
 * - Роль: продавец одежды (общается с покупателями Avito)
 * - Промпт: версионированный из БД (self-learning)
 * - Вывод: JSON { draft, confidence, reasoning } (structured output)
 * - Контекст: объявление Avito + товар из каталога (замеры, остатки)
 * - Temperature: 0.5 (предсказуемее для продаж)
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type {
  SalesDraftResult,
  SalesContext,
  FewShotExample,
  AiSalesCorrectionType,
} from "@/types/database";

// ============================================================================
// КЛИЕНТЫ
// ============================================================================

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ============================================================================
// ДЕФОЛТНЫЙ ПРОМПТ (версия 0 — используется до bootstrap анализа)
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `Ты — AI-продавец одежды на Avito. Ты общаешься с покупателями от имени магазина.

ГЛАВНЫЕ ПРАВИЛА:
• Отвечай кратко, по делу, дружелюбно
• Обращайся на "вы"
• Не используй эмодзи в сообщениях
• Цель — довести до сделки (покупатель пишет "беру" / оформляет заказ)

ПОДБОР РАЗМЕРА:
• Спроси рост/вес: "Подскажите, пожалуйста, рост и вес — подберу подходящий размер"
• Если есть замеры из каталога — используй их для точной рекомендации
• Если нет замеров — используй стандартную сетку:
  XS: 160-165 / 45-55кг, S: 165-170 / 55-65кг, M: 170-175 / 65-75кг
  L: 175-180 / 75-85кг, XL: 180-185 / 85-95кг, XXL: 185+ / 95+кг

РАБОТА С ВОЗРАЖЕНИЯМИ:
• "Дорого" → "Цена уже максимально лояльная, мы работаем напрямую с поставщиками"
• "Подумаю" → "Могу забронировать ваш размер, количество ограничено"
• Скидка → "К сожалению, мы уже работаем с минимальной наценкой"

СОЗДАНИЕ СРОЧНОСТИ:
• Упомяни ограниченный остаток если он мал: "Осталось N штук в этом размере"
• Быстрая доставка: "Если оформите сейчас — отправим сегодня"

ЗАПРЕЩЕНО:
• Называть цену ниже/выше указанной в объявлении
• Обещать то, чего нет (несуществующие размеры/цвета)
• Грубить или давить на покупателя
• Обсуждать конкурентов
• Использовать эмодзи`;

// ============================================================================
// ПОЛУЧЕНИЕ АКТИВНОГО ПРОМПТА
// ============================================================================

interface ActivePrompt {
  systemPrompt: string;
  fewShotExamples: FewShotExample[];
  learnedRules: string[];
  versionId: string | null;
}

export async function getActivePrompt(userId: string): Promise<ActivePrompt> {
  const supabase = getSupabase();

  const { data: version } = await supabase
    .from("ai_sales_prompt_versions")
    .select("id, system_prompt, few_shot_examples, learned_rules")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!version) {
    return {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      fewShotExamples: [],
      learnedRules: [],
      versionId: null,
    };
  }

  return {
    systemPrompt: version.system_prompt,
    fewShotExamples: (version.few_shot_examples as FewShotExample[]) || [],
    learnedRules: (version.learned_rules as string[]) || [],
    versionId: version.id,
  };
}

// ============================================================================
// ПОСТРОЕНИЕ КОНТЕКСТА
// ============================================================================

export async function buildSalesContext(userId: string, chatId: string): Promise<SalesContext> {
  const supabase = getSupabase();

  // 1. Получить данные чата
  const { data: chat } = await supabase.from("avito_chats").select("*").eq("id", chatId).single();

  if (!chat) {
    throw new Error(`Chat ${chatId} not found`);
  }

  // 2. Получить историю сообщений (последние 10)
  const { data: messages } = await supabase
    .from("avito_messages")
    .select("direction, content_text, avito_created_at")
    .eq("chat_id", chatId)
    .order("avito_created_at", { ascending: false })
    .limit(10);

  const chatHistory = (messages || [])
    .reverse()
    .filter((m) => m.content_text)
    .map((m) => ({
      role: (m.direction === "in" ? "buyer" : "seller") as "buyer" | "seller",
      text: m.content_text!,
    }));

  // 3. Попробовать найти наш товар через маппинг
  let product: SalesContext["product"] = undefined;

  if (chat.item_id) {
    const { data: mapping } = await supabase
      .from("avito_item_product_mapping")
      .select("product_id")
      .eq("user_id", userId)
      .eq("avito_item_id", chat.item_id)
      .single();

    if (mapping) {
      const { data: prod } = await supabase
        .from("products")
        .select(
          `
          name, brand, drop_price, measurements,
          product_sizes(size, current_quantity, reserved_quantity)
        `
        )
        .eq("id", mapping.product_id)
        .eq("is_active", true)
        .single();

      if (prod) {
        const sizes = (
          prod.product_sizes as Array<{
            size: string;
            current_quantity: number;
            reserved_quantity: number;
          }>
        )
          .filter((s) => s.current_quantity > s.reserved_quantity)
          .map((s) => s.size);

        const totalStock = (
          prod.product_sizes as Array<{
            current_quantity: number;
            reserved_quantity: number;
          }>
        ).reduce((sum, s) => sum + (s.current_quantity - s.reserved_quantity), 0);

        product = {
          name: prod.name,
          brand: prod.brand,
          dropPrice: prod.drop_price,
          measurements: prod.measurements as Record<string, Record<string, number>> | null,
          availableSizes: sizes,
          totalStock,
        };
      }
    }
  }

  return {
    avitoItemTitle: chat.item_title || "Unknown",
    avitoItemPrice: chat.item_price ? Number(chat.item_price) : null,
    avitoItemUrl: chat.item_url,
    buyerName: chat.buyer_name || "Покупатель",
    chatHistory,
    product,
  };
}

// ============================================================================
// ФОРМИРОВАНИЕ ПРОМПТА
// ============================================================================

function buildFullPrompt(
  systemPrompt: string,
  learnedRules: string[],
  context: SalesContext
): string {
  let prompt = systemPrompt;

  // Добавляем выученные правила
  if (learnedRules.length > 0) {
    prompt += `\n\n=== ВЫУЧЕННЫЕ ПРАВИЛА ===\n`;
    learnedRules.forEach((rule, i) => {
      prompt += `${i + 1}. ${rule}\n`;
    });
  }

  // Контекст объявления
  prompt += `\n\n=== КОНТЕКСТ ОБЪЯВЛЕНИЯ ===\n`;
  prompt += `Название: ${context.avitoItemTitle}\n`;
  if (context.avitoItemPrice) {
    prompt += `Цена: ${context.avitoItemPrice}₽\n`;
  }
  prompt += `Покупатель: ${context.buyerName}\n`;

  // Контекст из нашего каталога
  if (context.product) {
    const p = context.product;
    prompt += `\n=== ДАННЫЕ ИЗ КАТАЛОГА ===\n`;
    prompt += `Товар: ${p.name}`;
    if (p.brand) prompt += ` (${p.brand})`;
    prompt += `\n`;
    prompt += `Размеры в наличии: ${p.availableSizes.join(", ") || "нет"}\n`;
    prompt += `Общий остаток: ${p.totalStock} шт.\n`;

    if (p.measurements && Object.keys(p.measurements).length > 0) {
      prompt += `Замеры:\n`;
      for (const [size, m] of Object.entries(p.measurements)) {
        const parts: string[] = [];
        if (m.chest) parts.push(`грудь ${m.chest}см`);
        if (m.length) parts.push(`длина ${m.length}см`);
        if (m.shoulders) parts.push(`плечи ${m.shoulders}см`);
        if (m.waist) parts.push(`талия ${m.waist}см`);
        if (parts.length > 0) {
          prompt += `  ${size}: ${parts.join(", ")}\n`;
        }
      }
    }
  }

  // Инструкция для вывода
  prompt += `\n\n=== ФОРМАТ ОТВЕТА ===
Ответь JSON:
{
  "draft": "текст ответа покупателю",
  "confidence": число от 0.0 до 1.0 (уверенность в качестве ответа),
  "reasoning": "почему такой уровень уверенности"
}

Confidence guide:
• 0.9-1.0: стандартный вопрос (размер, наличие, доставка) с известным ответом
• 0.7-0.9: немного нетипичный вопрос, но ответ разумный
• 0.5-0.7: нестандартный вопрос, ответ может быть неточным
• <0.5: непонятный запрос, лучше передать владельцу`;

  return prompt;
}

function buildFewShotMessages(
  examples: FewShotExample[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const ex of examples.slice(0, 10)) {
    messages.push({ role: "user", content: ex.buyer_message });
    messages.push({
      role: "assistant",
      content: JSON.stringify({
        draft: ex.seller_response,
        confidence: 0.95,
        reasoning: "Стандартный вопрос из обученных примеров",
      }),
    });
  }

  return messages;
}

// ============================================================================
// ГЕНЕРАЦИЯ ЧЕРНОВИКА
// ============================================================================

export async function generateSalesDraft(
  userId: string,
  context: SalesContext,
  buyerMessage: string
): Promise<SalesDraftResult> {
  const startTime = Date.now();

  // 1. Получить активный промпт
  const { systemPrompt, fewShotExamples, learnedRules } = await getActivePrompt(userId);

  // 2. Построить полный промпт
  const fullPrompt = buildFullPrompt(systemPrompt, learnedRules, context);

  // 3. Построить массив сообщений
  const fewShot = buildFewShotMessages(fewShotExamples);
  const chatHistoryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = context.chatHistory
    .slice(-8)
    .map((m) => ({
      role: m.role === "buyer" ? ("user" as const) : ("assistant" as const),
      content:
        m.role === "seller"
          ? JSON.stringify({
              draft: m.text,
              confidence: 0.95,
              reasoning: "Предыдущий ответ",
            })
          : m.text,
    }));

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: fullPrompt },
    ...fewShot,
    ...chatHistoryMessages,
    { role: "user", content: buyerMessage.slice(0, 1000) },
  ];

  // 4. Вызов OpenAI
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    max_tokens: 300,
    temperature: 0.5,
  });

  const generationTimeMs = Date.now() - startTime;
  const tokensUsed =
    (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

  // 5. Парсим ответ
  const content = response.choices[0]?.message?.content || "{}";
  let parsed: { draft?: string; confidence?: number; reasoning?: string };

  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[sales-agent] Failed to parse JSON:", content);
    parsed = {
      draft: content,
      confidence: 0.3,
      reasoning: "Не удалось распарсить JSON — передаю как есть",
    };
  }

  return {
    draft: parsed.draft || "Здравствуйте! Чем могу помочь?",
    confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
    reasoning: parsed.reasoning || "",
    tokensUsed,
    generationTimeMs,
  };
}

// ============================================================================
// АНАЛИЗ ПРАВКИ (для self-learning)
// ============================================================================

export async function analyzeCorrection(
  original: string,
  corrected: string,
  context: SalesContext
): Promise<{
  correctionType: AiSalesCorrectionType;
  analysis: string;
}> {
  const prompt = `Ты анализируешь правку оператора к AI-ответу покупателю на Avito.

Контекст:
- Товар: ${context.avitoItemTitle}
- Цена: ${context.avitoItemPrice || "не указана"}₽

Оригинальный ответ AI:
"${original}"

Исправленный оператором ответ:
"${corrected}"

Определи категорию правки и объясни почему оператор исправил:

Категории:
- tone: изменение тона/стиля общения
- factual: фактическая ошибка (неверная информация о товаре)
- pricing: связано с ценой/скидками
- sizing: связано с размерами
- urgency: связано с созданием срочности/мотивации
- other: другое

Ответь JSON:
{
  "correctionType": "одна из категорий",
  "analysis": "краткое объяснение (1-2 предложения)"
}`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const validTypes: AiSalesCorrectionType[] = [
      "tone",
      "factual",
      "pricing",
      "sizing",
      "urgency",
      "other",
    ];
    const correctionType = validTypes.includes(parsed.correctionType)
      ? parsed.correctionType
      : "other";

    return {
      correctionType,
      analysis: parsed.analysis || "",
    };
  } catch (error) {
    console.error("[sales-agent] analyzeCorrection error:", error);
    return {
      correctionType: "other",
      analysis: "Не удалось проанализировать правку",
    };
  }
}

// ============================================================================
// ОБУЧЕНИЕ НА ПРАВКАХ (ночной job)
// ============================================================================

interface CorrectionInput {
  original: string;
  corrected: string;
  buyerMessage: string;
  correctionType: string;
}

export async function learnFromCorrections(
  userId: string,
  corrections: CorrectionInput[],
  currentPrompt: string,
  currentRules: string[],
  currentExamples: FewShotExample[]
): Promise<{
  newRules: string[];
  newExamples: FewShotExample[];
  updatedPrompt: string;
  summary: string;
}> {
  if (corrections.length === 0) {
    return {
      newRules: currentRules,
      newExamples: currentExamples,
      updatedPrompt: currentPrompt,
      summary: "Нет правок для анализа",
    };
  }

  // Группируем правки по типу
  const byType: Record<string, CorrectionInput[]> = {};
  for (const c of corrections) {
    const type = c.correctionType || "other";
    if (!byType[type]) byType[type] = [];
    byType[type].push(c);
  }

  const correctionsText = corrections
    .map(
      (c, i) =>
        `Правка #${i + 1} (${c.correctionType}):
  Покупатель написал: "${c.buyerMessage}"
  AI ответил: "${c.original}"
  Оператор исправил на: "${c.corrected}"`
    )
    .join("\n\n");

  const typeSummary = Object.entries(byType)
    .map(([type, items]) => `${type}: ${items.length}`)
    .join(", ");

  const prompt = `Ты анализируешь правки оператора к AI-ответам покупателям на Avito за сегодня.

Всего правок: ${corrections.length}
По типам: ${typeSummary}

ТЕКУЩИЕ ПРАВИЛА AI:
${currentRules.length > 0 ? currentRules.map((r, i) => `${i + 1}. ${r}`).join("\n") : "(пока нет правил)"}

ПРАВКИ ЗА СЕГОДНЯ:
${correctionsText}

Твоя задача:
1. Определить паттерны ошибок AI
2. Сформулировать НОВЫЕ правила (или обновить существующие), чтобы AI не повторял ошибки
3. Выбрать 3-5 лучших пар "вопрос → ответ" из исправленных вариантов для few-shot примеров
4. Написать краткое саммари для владельца

Ответь JSON:
{
  "newRules": ["правило 1", "правило 2", ...],
  "newExamples": [
    { "buyer_message": "...", "seller_response": "...", "context_notes": "..." }
  ],
  "summary": "Краткое саммари на 2-3 предложения для владельца"
}`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1000,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    // Мержим новые правила с существующими (дедупликация)
    const mergedRules = [...currentRules];
    for (const rule of parsed.newRules || []) {
      if (!mergedRules.some((r) => r.toLowerCase() === rule.toLowerCase())) {
        mergedRules.push(rule);
      }
    }

    // Мержим примеры (новые в начало, лимит 15)
    const mergedExamples = [...(parsed.newExamples || []), ...currentExamples].slice(0, 15);

    return {
      newRules: mergedRules,
      newExamples: mergedExamples,
      updatedPrompt: currentPrompt, // Промпт пока не меняем автоматически
      summary: parsed.summary || `Проанализировано ${corrections.length} правок`,
    };
  } catch (error) {
    console.error("[sales-agent] learnFromCorrections error:", error);
    return {
      newRules: currentRules,
      newExamples: currentExamples,
      updatedPrompt: currentPrompt,
      summary: `Ошибка анализа: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }
}

/**
 * AI-помощник для страницы поддержки
 *
 * Возможности:
 * - Экспертиза по продажам на Avito
 * - Подбор размеров по рост/вес
 * - Поиск товаров в каталоге
 * - Веб-поиск через Perplexity (опционально)
 * - Персонализированные ответы
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// КЛИЕНТЫ API
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase service client для запросов к БД
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ============================================================================
// ТИПЫ
// ============================================================================

export interface UserContext {
  name: string;
  level: number;
  discount: number;
  deposit: number;
  referralDeposit: number;
  subscriptionTier: string;
  isVibePlus: boolean;
  completedOrders: number;
}

export interface OrderContext {
  id: string;
  productTitle: string;
  size: string;
  status: string;
  deadline: string | null;
  trackingNumber: string | null;
  returnCode: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProductMeasurements {
  [size: string]: {
    chest?: number;
    length?: number;
    shoulders?: number;
    sleeves?: number;
    waist?: number;
    hips?: number;
  };
}

interface ProductSearchResult {
  id: string;
  name: string;
  category: string;
  brand: string;
  dropPrice: number;
  measurements: ProductMeasurements | null;
  availableSizes: string[];
  hasMeasurements: boolean;
}

// ============================================================================
// СИСТЕМНЫЙ ПРОМПТ
// ============================================================================

const SYSTEM_PROMPT = `Ты — AI-помощник для дропшипперов на Avito. Твои клиенты продают одежду через свои магазины на Avito, а мы закупаем, храним и отправляем товар.

СТИЛЬ:
• Дружелюбно, на "ты", практично
• Давай конкретные советы, а не общие фразы
• Без эмодзи

ФОРМАТ ОТВЕТОВ:
• Используй структуру с пунктами (•) для перечислений
• Разбивай информацию на логические блоки с заголовками
• Каждый совет — отдельный пункт
• Между блоками — пустая строка
• На простые вопросы отвечай кратко (1-3 предложения)
• На сложные вопросы — структурированно с пунктами

Пример хорошего ответа:
"Чтобы увеличить продажи, сфокусируйся на трёх аспектах:

Скорость ответа
• Отвечай покупателям в течение 5 минут
• Это напрямую влияет на ранжирование

Качество объявлений
• Добавь 5+ фото с разных ракурсов
• В описание включи ключевые слова и размерную сетку

Цены и продвижение
• На старте ставь цену чуть ниже конкурентов
• Продвигай в часы пик (18-22, выходные)"

=== ЭКСПЕРТИЗА AVITO ===

ПОДБОР РАЗМЕРА — твой главный скилл:
• Спрашивай рост/вес покупателя — это быстрее замеров
• Фраза: "Подскажите рост/вес, подберу подходящий размер"
• Если просят замеры: "Подбираем по рост/вес — так точнее. Товар идёт в EU размерах"
• Используй инструмент search_product чтобы найти товар и его замеры
• Если замеров нет — предупреди, но всё равно дай рекомендацию по стандартной сетке

СТАНДАРТНАЯ РАЗМЕРНАЯ СЕТКА (если нет замеров):
• XS: рост 160-165, вес 45-55 кг
• S: рост 165-170, вес 55-65 кг
• M: рост 170-175, вес 65-75 кг
• L: рост 175-180, вес 75-85 кг
• XL: рост 180-185, вес 85-95 кг
• XXL: рост 185+, вес 95+ кг

УВЕЛИЧЕНИЕ ПРОДАЖ НА AVITO:
• Скорость ответа — влияет на ранжирование! Отвечай покупателям быстро
• SEO в описании — добавляй ключевые слова (бренд, материал, стиль)
• Качественные фото с разных ракурсов, естественное освещение
• В описании: размерная сетка, материал, с чем сочетается
• Цена чуть ниже конкурентов на старте → поднимай после отзывов
• Продвигай объявления в часы пик (вечер 18-22, выходные)

РАБОТА С ПОКУПАТЕЛЯМИ:
• Создавай срочность: "Если закажете сейчас — отправим сегодня"
• Не давай времени "подумать" — клиент может уйти к конкуренту
• Скидка: "Рад бы сделать скидку, но я менеджер — цены уже лояльные"
• Сомнения: "Задавай вопросы — помогу с любым"
• "Подумаю": предложи бронь на размер

ОТЗЫВЫ:
• Накрутка: продай дешёвый товар (носки) в обмен на отзыв
• Плохой отзыв: не спорь, попроси удалить за компенсацию 300-500₽

=== РЕФЕРАЛЬНАЯ СИСТЕМА (важно!) ===

• 500₽ после первого завершённого заказа друга
• 7% от КАЖДОГО его заказа в течение 60 дней
• Лимит на одного реферала: 7000₽
• Пример: друг заказал на 50к за 2 месяца → 500 + 3500 = 4000₽
• Это реальный пассивный доход! Активно приглашай друзей

=== СИСТЕМА СЕРВИСА ===

УРОВНИ: 0 (0-14, 0%) → 1 (15-29, 3%) → 2 (30-49, 6%) → 3 (50+, 10%)
Скидка от drop_price. Новым: -500₽ на первый заказ.

ПОДПИСКИ:
• Basic 500₽/мес: 3 заказа/день, каталог
• Premium 5000₽/мес: безлимит, гонка, AI-помощь
• TFB 15000₽/мес: + Avito API, AI-продажник

+ВАЙБ: уровень 3 + долг до 100к + premium товары. Выдаёт владелец.

ЗАКАЗЫ: Каталог → товар → размер → дедлайн → ПВЗ → оплата
Отправка: до 17:00 МСК ежедневно. Доставка 2-7 дней.

СТАТУСЫ: awaiting_shipment → collecting → in_transit → completed
problem = нет в наличии (деньги вернутся)

ВОЗВРАТЫ: Заказы → заказ → Возврат. Код обновляется каждый день.

=== ИНСТРУМЕНТЫ ===

У тебя есть инструменты:
• search_product — поиск товара по названию (для подбора размера)
• web_search — поиск в интернете (для актуальной информации по Avito)

Используй search_product когда клиент спрашивает про конкретный товар или размер.
Используй web_search когда нужна актуальная информация (тренды, новости Avito).

=== ПОВЕДЕНИЕ ===

ПЕРСОНАЛИЗАЦИЯ: используй данные клиента!
• "Сколько до уровня?" → "У тебя 27 заказов, до уровня 2 осталось 3!"
• "Как заработать?" → посчитай потенциал рефералов

ПРОАКТИВНОСТЬ: есть problem/возврат без кода → упомяни сразу.

ЭСКАЛАЦИЯ: вывод депозита, брак, проблемы с оплатой → @avitofammanager

НЕ ЗНАЮ → "Напиши владельцу: @avitofammanager"`;

// ============================================================================
// TOOLS DEFINITIONS
// ============================================================================

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_product",
      description:
        "Поиск товара в каталоге по названию. Возвращает информацию о товаре включая замеры для подбора размера.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Название товара или его часть для поиска",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Поиск актуальной информации в интернете. Используй для вопросов о трендах, новостях Avito, актуальных советах по продажам.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Поисковый запрос на русском языке",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ============================================================================
// TOOL HANDLERS
// ============================================================================

/**
 * Поиск товара в каталоге
 */
async function searchProduct(query: string): Promise<ProductSearchResult[]> {
  const supabase = getSupabaseClient();

  const { data: products, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      category,
      brand,
      drop_price,
      measurements,
      product_sizes!inner(size, current_quantity, reserved_quantity)
    `
    )
    .eq("is_active", true)
    .ilike("name", `%${query}%`)
    .limit(5);

  if (error) {
    console.error("[support-agent] Product search error:", error);
    return [];
  }

  return (products || []).map((p) => {
    const sizes = (
      p.product_sizes as Array<{
        size: string;
        current_quantity: number;
        reserved_quantity: number;
      }>
    )
      .filter((s) => s.current_quantity > s.reserved_quantity)
      .map((s) => s.size);

    return {
      id: p.id,
      name: p.name,
      category: p.category || "",
      brand: p.brand || "",
      dropPrice: p.drop_price,
      measurements: p.measurements as ProductMeasurements | null,
      availableSizes: sizes,
      hasMeasurements: !!p.measurements && Object.keys(p.measurements).length > 0,
    };
  });
}

/**
 * Веб-поиск через OpenAI Responses API
 */
async function webSearch(query: string): Promise<string> {
  try {
    // Используем Responses API с встроенным web_search
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search" }],
      input: `Найди актуальную информацию на русском языке: ${query}`,
    });

    // Извлекаем текстовый ответ
    const textOutput = response.output.find((item) => item.type === "message");
    if (textOutput && textOutput.type === "message") {
      const textContent = textOutput.content.find((c) => c.type === "output_text");
      if (textContent && textContent.type === "output_text") {
        return textContent.text;
      }
    }

    return "Не удалось найти информацию.";
  } catch (error) {
    console.error("[support-agent] OpenAI web search error:", error);
    return "Ошибка веб-поиска. Отвечаю на основе своих знаний.";
  }
}

/**
 * Обработка tool calls
 */
async function handleToolCalls(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
): Promise<OpenAI.Chat.ChatCompletionToolMessageParam[]> {
  const results: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

  for (const toolCall of toolCalls) {
    if (toolCall.type !== "function") continue;

    const args = JSON.parse(toolCall.function.arguments);
    let result: string;

    switch (toolCall.function.name) {
      case "search_product": {
        const products = await searchProduct(args.query);
        if (products.length === 0) {
          result = `Товары по запросу "${args.query}" не найдены.`;
        } else {
          result = products
            .map((p) => {
              let info = `📦 ${p.name} (${p.brand})\n`;
              info += `   Цена: ${p.dropPrice}₽\n`;
              info += `   Размеры в наличии: ${p.availableSizes.join(", ") || "нет"}\n`;

              if (p.hasMeasurements && p.measurements) {
                info += `   Замеры:\n`;
                for (const [size, m] of Object.entries(p.measurements)) {
                  const parts: string[] = [];
                  if (m.chest) parts.push(`грудь ${m.chest}см`);
                  if (m.length) parts.push(`длина ${m.length}см`);
                  if (m.shoulders) parts.push(`плечи ${m.shoulders}см`);
                  if (m.waist) parts.push(`талия ${m.waist}см`);
                  if (parts.length > 0) {
                    info += `      ${size}: ${parts.join(", ")}\n`;
                  }
                }
              } else {
                info += `   ⚠️ Замеры не добавлены — используй стандартную сетку EU\n`;
              }
              return info;
            })
            .join("\n");
        }
        break;
      }

      case "web_search": {
        result = await webSearch(args.query);
        break;
      }

      default:
        result = "Неизвестный инструмент";
    }

    results.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: result,
    });
  }

  return results;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

function formatDate(date: string | null): string {
  if (!date) return "не указан";
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    awaiting_shipment: "ждёт сборки",
    collecting: "собирается",
    in_transit: "в пути",
    completed: "доставлен",
    problem: "проблема",
    cancelled: "отменён",
    return_in_transit: "возврат в пути",
    return_arrived: "возврат на ПВЗ",
    return_completed: "возврат завершён",
    trash: "утиль",
    disposed: "утилизирован",
  };
  return statusMap[status] || status;
}

/**
 * Формирует контекст пользователя для промпта
 */
export function buildUserContext(user: UserContext, orders: OrderContext[]): string {
  const activeOrders = orders.filter((o) =>
    ["awaiting_shipment", "collecting", "in_transit"].includes(o.status)
  );
  const returns = orders.filter((o) =>
    ["return_in_transit", "return_arrived", "return_completed"].includes(o.status)
  );

  // Вычисляем сколько до следующего уровня
  let nextLevelInfo = "";
  if (user.level === 0 && user.completedOrders < 15) {
    nextLevelInfo = `До уровня 1 осталось ${15 - user.completedOrders} заказов`;
  } else if (user.level === 1 && user.completedOrders < 30) {
    nextLevelInfo = `До уровня 2 осталось ${30 - user.completedOrders} заказов`;
  } else if (user.level === 2 && user.completedOrders < 50) {
    nextLevelInfo = `До уровня 3 осталось ${50 - user.completedOrders} заказов`;
  } else if (user.level === 3) {
    nextLevelInfo = "Максимальный уровень достигнут";
  }

  // Расчёт потенциала рефералов
  const referralPotential = Math.round(user.completedOrders * 0.07 * 2000); // Примерный средний чек

  let context = `
=== КОНТЕКСТ КЛИЕНТА ===
Имя: ${user.name}
Уровень: ${user.level} (скидка ${user.discount}%)
${nextLevelInfo}
Депозит: ${user.deposit}₽ + ${user.referralDeposit}₽ реф.
Подписка: ${user.subscriptionTier}
+ВАЙБ: ${user.isVibePlus ? "Да" : "Нет"}
Завершённых заказов: ${user.completedOrders}
Потенциал реферала с такой активностью: ~${referralPotential}₽
`;

  if (activeOrders.length > 0) {
    context += `\n=== АКТИВНЫЕ ЗАКАЗЫ (${activeOrders.length}) ===\n`;
    activeOrders.forEach((o) => {
      context += `• #${o.id.slice(0, 8)} — ${o.productTitle}, ${o.size}\n`;
      context += `  Статус: ${translateStatus(o.status)}, дедлайн: ${formatDate(o.deadline)}\n`;
      if (o.trackingNumber) context += `  Трек: ${o.trackingNumber}\n`;
    });
  }

  if (returns.length > 0) {
    context += `\n=== ВОЗВРАТЫ (${returns.length}) ===\n`;
    returns.forEach((r) => {
      context += `• #${r.id.slice(0, 8)} — ${r.productTitle}\n`;
      context += `  Статус: ${translateStatus(r.status)}\n`;
      if (r.returnCode) {
        context += `  Код: ${r.returnCode}\n`;
      } else if (r.status === "return_arrived") {
        context += `  ⚠️ КОД НЕ УКАЗАН! Нужно срочно указать.\n`;
      }
    });
  }

  return context;
}

// ============================================================================
// ГЕНЕРАЦИЯ ОТВЕТОВ
// ============================================================================

/**
 * Генерирует ответ AI с поддержкой tools
 */
export async function generateResponse(
  message: string,
  userContext: string,
  history: ChatMessage[] = []
): Promise<string> {
  const sanitizedMessage = message.slice(0, 1000);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT + "\n\n" + userContext },
    ...history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: sanitizedMessage },
  ];

  try {
    // Первый запрос с tools
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 500,
      temperature: 0.7,
    });

    let assistantMessage = response.choices[0]?.message;

    // Обработка tool calls (макс 3 итерации)
    let iterations = 0;
    while (assistantMessage?.tool_calls && iterations < 3) {
      iterations++;

      const toolResults = await handleToolCalls(assistantMessage.tool_calls);

      messages.push(assistantMessage);
      messages.push(...toolResults);

      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 500,
        temperature: 0.7,
      });

      assistantMessage = response.choices[0]?.message;
    }

    return assistantMessage?.content || "Не могу ответить. Напиши владельцу: @avitofammanager";
  } catch (error) {
    console.error("[support-agent] OpenAI error:", error);
    throw error;
  }
}

/**
 * Генерирует streaming ответ с поддержкой tools
 */
export async function* generateStreamingResponse(
  message: string,
  userContext: string,
  history: ChatMessage[] = []
): AsyncGenerator<string> {
  const sanitizedMessage = message.slice(0, 1000);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT + "\n\n" + userContext },
    ...history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: sanitizedMessage },
  ];

  try {
    // Первый запрос (non-streaming для tool calls)
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 500,
      temperature: 0.7,
    });

    let assistantMessage = response.choices[0]?.message;

    // Обработка tool calls
    let iterations = 0;
    while (assistantMessage?.tool_calls && iterations < 3) {
      iterations++;

      // Показываем что ищем
      const firstToolCall = assistantMessage.tool_calls[0];
      const toolName = firstToolCall?.type === "function" ? firstToolCall.function.name : null;
      if (toolName === "search_product") {
        yield "Ищу товар в каталоге...\n\n";
      } else if (toolName === "web_search") {
        yield "Ищу информацию...\n\n";
      }

      const toolResults = await handleToolCalls(assistantMessage.tool_calls);

      messages.push(assistantMessage);
      messages.push(...toolResults);

      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 500,
        temperature: 0.7,
      });

      assistantMessage = response.choices[0]?.message;
    }

    // Финальный streaming ответ
    if (assistantMessage?.content) {
      // Если есть готовый контент — стримим его посимвольно
      const content = assistantMessage.content;
      const chunkSize = 3;
      for (let i = 0; i < content.length; i += chunkSize) {
        yield content.slice(i, i + chunkSize);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } else {
      // Делаем новый streaming запрос
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    }
  } catch (error) {
    console.error("[support-agent] Streaming error:", error);
    throw error;
  }
}

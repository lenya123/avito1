/**
 * Выбор категории в Avito wizard. Сначала пробуем OpenAI, при ошибке
 * (например 403 — Russia блок) fallback на keyword-matching.
 */
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // OPENAI_BASE_URL — для обхода 403 РФ-блока через reseller-прокси
      // (proxyapi.ru, vsegpt.ru, openrouter.ai и т.п.).
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return _openai;
}

const norm = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Rule-based выбор категории по ключевым словам в названии товара.
 * Используется как fallback когда OpenAI недоступен (403 из РФ).
 */
function keywordPick(productTitle: string, options: string[]): string | null {
  const t = norm(productTitle);
  // Категория → ключевые слова (расширяй по мере появления новых товаров)
  const KEYWORD_MAP: Array<{ category: string; keywords: string[] }> = [
    // Одежда / обувь / аксессуары
    {
      category: "Личные вещи",
      keywords: [
        "джинс", "штан", "куртк", "майк", "футбол", "плать", "сапог", "ботин", "крос",
        "туфл", "шуб", "пальт", "брюк", "юбк", "рубаш", "пиджак", "костюм", "свитер",
        "толстовк", "худи", "трико", "халат", "пижам", "купаль", "белье", "носк", "перчатк",
        "шапк", "шарф", "ремен", "сумк", "рюкзак", "часы", "очк", "ash", "zara", "nike", "adidas",
      ],
    },
    {
      category: "Одежда, обувь, аксессуары",
      keywords: [
        "джинс", "штан", "куртк", "майк", "футбол", "плать", "сапог", "ботин", "крос",
        "туфл", "шуб", "пальт", "брюк", "юбк", "рубаш", "пиджак", "костюм", "свитер",
        "толстовк", "худи", "ash", "zara", "nike", "adidas",
      ],
    },
    // По полу
    {
      category: "Женская одежда",
      keywords: ["женск", "юбк", "плать", "блуз", "сарафан", "колгот"],
    },
    {
      category: "Мужская одежда",
      keywords: ["мужск", "брюк", "костюм", "галстук"],
    },
    // Подкатегории одежды
    { category: "Джинсы", keywords: ["джинс"] },
    { category: "Брюки", keywords: ["брюк", "штан"] },
    { category: "Куртки", keywords: ["куртк"] },
    { category: "Платья, юбки", keywords: ["плать", "юбк"] },
    { category: "Обувь", keywords: ["крос", "ботин", "туфл", "сапог", "кед"] },
    // Электроника
    {
      category: "Электроника",
      keywords: [
        "телевизор", "ноутбук", "телефон", "айфон", "iphone", "samsung", "плей", "консол",
        "ps5", "ps4", "xbox", "наушник", "колонк", "монитор", "клавиатур", "мыш", "роутер",
        "планшет", "ipad", "macbook", "процессор", "видеокарт", "ssd", "ddr", "оператив",
      ],
    },
    { category: "Игры, приставки и программы", keywords: ["ps5", "ps4", "xbox", "playstation", "консол", "приставк"] },
    // Дом и дача
    { category: "Для дома и дачи", keywords: ["стол", "стул", "кроват", "диван", "шкаф", "кух", "посуд", "кастрюл"] },
    // Хобби
    { category: "Хобби и отдых", keywords: ["велосипед", "самокат", "гитар", "пианин", "конструктор", "лего"] },
    // Услуги
    { category: "Услуги", keywords: ["репетитор", "услуг", "мастер", "ремонт"] },
    { category: "Предложение услуг", keywords: ["репетитор", "услуг", "мастер"] },
  ];

  for (const { category, keywords } of KEYWORD_MAP) {
    if (keywords.some((kw) => t.includes(kw))) {
      const match = options.find((o) => norm(o) === norm(category));
      if (match) return match;
    }
  }
  // Если ничего не подошло — fallback на "Другая категория" если есть
  const other = options.find((o) => norm(o).includes("друг"));
  return other ?? options[0] ?? null;
}

export async function pickCategoryStep(
  productTitle: string,
  productDescription: string | undefined,
  options: string[]
): Promise<string | null> {
  if (options.length === 0) return null;
  if (options.length === 1) return options[0];

  // Сначала пробуем OpenAI. Если не работает (403 РФ, network, rate-limit) —
  // мгновенно fallback на keyword-pick.
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await openai().chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "Ты помогаешь оператору Avito выбрать категорию объявления через multistep wizard.",
              "На каждом шаге даётся товар и список доступных кнопок. Верни СТРОГО точный текст одной кнопки.",
              "",
              "Правила маппинга для типичных товаров (запомни иерархию Avito):",
              "• Одежда/обувь/аксессуары (джинсы, куртки, кроссовки, сапоги, футболки, платья, сумки, часы, очки) → ВЕРХНИЙ раздел 'Личные вещи', потом подраздел 'Одежда, обувь, аксессуары', далее 'Мужская/Женская одежда', затем тип товара ('Джинсы', 'Куртки', 'Обувь').",
              "• Электроника (телефоны, ноутбуки, ПК, ТВ, наушники, консоли PS/Xbox) → 'Электроника'.",
              "• Бытовая мебель/посуда → 'Для дома и дачи'.",
              "• Велосипеды, музыка, спорт, игрушки, книги → 'Хобби и отдых'.",
              "• Аквариумы/корма/всё для животных → 'Животные'.",
              "• Услуги (репетитор, ремонт, мастер) → 'Услуги' если есть, иначе 'Другая категория'.",
              "",
              "ВАЖНО: используй 'Другая категория' ТОЛЬКО когда категория товара ВООБЩЕ не относится к доступным вариантам. Если есть подходящий раздел — выбирай его.",
              "Если есть 'Мужская одежда'/'Женская одежда' и пол не указан — выбирай 'Мужская одежда' по дефолту.",
              "",
              "Ответ — только название кнопки без кавычек, без объяснений, БЕЗ номера.",
            ].join("\n"),
          },
          {
            role: "user",
            content: `Товар: "${productTitle}"\n${productDescription ? "Описание: " + productDescription.slice(0, 300) + "\n" : ""}\nКнопки на текущем шаге wizard:\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\nКакую кнопку нажать?`,
          },
        ],
      });
      const picked = (res.choices[0]?.message?.content ?? "").trim();
      const npicked = norm(picked);
      const match = options.find((o) => norm(o) === npicked);
      if (match) return match;
      const partial = options.find((o) => norm(picked).includes(norm(o)) || norm(o).includes(norm(picked)));
      if (partial) return partial;
      // AI вернул что-то странное — упадём на keyword
    } catch (e) {
      console.error(`[category-picker] OpenAI failed (${(e as Error)?.message}), fallback to keyword`);
    }
  }

  return keywordPick(productTitle, options);
}

/**
 * Единый источник правды для подписок
 *
 * Используется везде: сайт, Telegram бот, API
 * При изменении — обновить docs/BUSINESS_LOGIC.md
 */

export type SubscriptionTier = "none" | "basic" | "premium" | "top_floor_boss";

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  price: number;
  priceVibe: number | null; // null = недоступен для +ВАЙБ
  dailyOrderLimit: number | null; // null = безлимит
  features: string[];
  emoji: string;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  none: {
    tier: "none",
    name: "Нет подписки",
    price: 0,
    priceVibe: null,
    dailyOrderLimit: 0,
    features: [],
    emoji: "❌",
  },

  basic: {
    tier: "basic",
    name: "Basic",
    price: 500,
    priceVibe: null, // +ВАЙБ автоматически получают Premium
    dailyOrderLimit: 3,
    features: ["Доступ к каталогу", "3 заказа в день", "Статистика продаж", "Push-уведомления"],
    emoji: "📦",
  },

  premium: {
    tier: "premium",
    name: "Premium",
    price: 5000,
    priceVibe: 0, // Бесплатно для +ВАЙБ
    dailyOrderLimit: null,
    features: [
      "Всё из Basic",
      "Безлимит на кол-во заказов",
      "Первым видишь новинки",
      "Эксклюзивные позиции",
      "Dashboard с графиками",
      "Обучение и гайды",
      "AI-помощник 24/7",
      "Еженедельная гонка продаж",
    ],
    emoji: "⭐",
  },

  top_floor_boss: {
    tier: "top_floor_boss",
    name: "Top Floor Boss",
    price: 10000, // Минимальный вариант (1 аккаунт). Полный прайс — см. TFB_VARIANTS.
    priceVibe: 7000,
    dailyOrderLimit: null,
    features: [
      "Всё из Premium",
      "Подключение Avito магазинов",
      "AI отвечает покупателям",
      "Статистика заказов по API",
      "Автопубликация объявлений",
      "Генерация фото через AI",
      "Персональные консультации",
    ],
    emoji: "👑",
  },
};

/**
 * Вариации Top Floor Boss по количеству Avito аккаунтов.
 * Аналог Claude Max sub-tier выбора.
 */
export interface TopFloorBossVariant {
  accounts: number;
  price: number;
  priceVibe: number;
  label: string;
}

export const TFB_VARIANTS: TopFloorBossVariant[] = [
  { accounts: 1, price: 10000, priceVibe: 7000, label: "1 аккаунт" },
  { accounts: 2, price: 15000, priceVibe: 10000, label: "2 аккаунта" },
  { accounts: 3, price: 20000, priceVibe: 14000, label: "3 аккаунта" },
];

/**
 * Получить вариант TFB по количеству аккаунтов
 */
export function getTfbVariant(accounts: number): TopFloorBossVariant {
  return TFB_VARIANTS.find((v) => v.accounts === accounts) ?? TFB_VARIANTS[0];
}

/**
 * Получить цену TFB для указанного количества аккаунтов
 */
export function getTfbPrice(accounts: number, isVibePlus: boolean): number {
  const variant = getTfbVariant(accounts);
  return isVibePlus ? variant.priceVibe : variant.price;
}

/**
 * Форматирует цену подписки для отображения
 */
export function formatSubscriptionPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽/мес`;
}

/**
 * Генерирует текст подписок для Telegram бота
 */
export function getSubscriptionTextForBot(currentTier?: SubscriptionTier | null): string {
  let text = "Выберите тариф:\n\n";

  const tiers: SubscriptionTier[] = ["basic", "premium", "top_floor_boss"];

  for (const tier of tiers) {
    const plan = SUBSCRIPTION_PLANS[tier];
    if (tier === "top_floor_boss") {
      text += `${plan.emoji} ${plan.name.toUpperCase()}\n`;
      for (const variant of TFB_VARIANTS) {
        text += `  ${variant.label}: ${formatSubscriptionPrice(variant.price)}\n`;
      }
    } else {
      text += `${plan.emoji} ${plan.name.toUpperCase()} — ${formatSubscriptionPrice(plan.price)}\n`;
    }
    for (const feature of plan.features) {
      text += `• ${feature}\n`;
    }
    text += "\n";
  }

  if (currentTier && currentTier !== "none") {
    const currentPlan = SUBSCRIPTION_PLANS[currentTier];
    text += `✅ Текущий тариф: ${currentPlan.name}`;
  }

  return text.trim();
}

/**
 * Проверяет лимит заказов для тарифа
 */
export function canCreateOrder(
  tier: SubscriptionTier,
  todayOrdersCount: number,
  isVibePlus: boolean
): { allowed: boolean; reason?: string } {
  // +ВАЙБ всегда без лимита
  if (isVibePlus) {
    return { allowed: true };
  }

  const plan = SUBSCRIPTION_PLANS[tier];

  // Нет подписки
  if (tier === "none") {
    return { allowed: false, reason: "Нужна подписка для создания заказов" };
  }

  // Безлимит
  if (plan.dailyOrderLimit === null) {
    return { allowed: true };
  }

  // Проверка лимита
  if (todayOrdersCount >= plan.dailyOrderLimit) {
    return {
      allowed: false,
      reason: `Достигнут лимит ${plan.dailyOrderLimit} заказов в день. Перейди на Premium для безлимита.`,
    };
  }

  return { allowed: true };
}

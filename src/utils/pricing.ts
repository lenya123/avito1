// Утилиты для расчёта цен и скидок

import type { SubscriptionTier } from "@/types/database";

// =============================================================================
// Константы лимитов заказов
// =============================================================================
export const DAILY_ORDER_LIMIT_BASIC = 3;
export const DAILY_ORDER_LIMIT_UNLIMITED = Infinity;

// Лимиты по подпискам
export const ORDER_LIMITS_BY_TIER: Record<SubscriptionTier | "none", number> = {
  none: 0,
  basic: DAILY_ORDER_LIMIT_BASIC,
  premium: DAILY_ORDER_LIMIT_UNLIMITED,
  top_floor_boss: DAILY_ORDER_LIMIT_UNLIMITED,
};

// =============================================================================
// Проверка лимита заказов
// =============================================================================
export type OrderLimitResult = {
  hasLimit: boolean;
  limit: number;
  remaining: number;
  canOrder: boolean;
  upgradeMessage?: string;
};

export function checkDailyOrderLimit({
  subscriptionTier,
  isVibePlus,
  todayOrdersCount,
}: {
  subscriptionTier: SubscriptionTier | "none";
  isVibePlus: boolean;
  todayOrdersCount: number;
}): OrderLimitResult {
  // +ВАЙБ всегда без лимита
  if (isVibePlus) {
    return {
      hasLimit: false,
      limit: DAILY_ORDER_LIMIT_UNLIMITED,
      remaining: DAILY_ORDER_LIMIT_UNLIMITED,
      canOrder: true,
    };
  }

  const limit = ORDER_LIMITS_BY_TIER[subscriptionTier] ?? 0;

  // Безлимитные подписки
  if (limit === DAILY_ORDER_LIMIT_UNLIMITED) {
    return {
      hasLimit: false,
      limit: DAILY_ORDER_LIMIT_UNLIMITED,
      remaining: DAILY_ORDER_LIMIT_UNLIMITED,
      canOrder: true,
    };
  }

  const remaining = Math.max(0, limit - todayOrdersCount);
  const canOrder = remaining > 0;

  return {
    hasLimit: true,
    limit,
    remaining,
    canOrder,
    upgradeMessage: canOrder ? undefined : "Перейдите на Premium для безлимитных заказов",
  };
}

// =============================================================================
// Расчёт цен
// =============================================================================
export type PriceBreakdown = {
  basePrice: number; // drop_price товара
  firstOrderDiscount: number; // Скидка 500₽ для новичков
  levelDiscount: number; // Скидка по уровню
  levelDiscountPercent: number;
  totalDiscount: number;
  finalPrice: number;
};

export function calculatePriceBreakdown({
  dropPrice,
  discountPercent,
  isFirstOrder,
  firstOrderDiscountAmount = 500,
}: {
  dropPrice: number;
  discountPercent: number;
  isFirstOrder: boolean;
  firstOrderDiscountAmount?: number;
}): PriceBreakdown {
  const basePrice = dropPrice;
  let firstOrderDiscount = 0;
  let levelDiscount = 0;

  // 1. Скидка 500₽ для первого заказа
  if (isFirstOrder) {
    firstOrderDiscount = Math.min(firstOrderDiscountAmount, basePrice);
  }

  // 2. Скидка по уровню (от оставшейся цены после скидки 500₽)
  const priceAfterFirstDiscount = basePrice - firstOrderDiscount;
  levelDiscount = Math.round((priceAfterFirstDiscount * discountPercent) / 100);

  const totalDiscount = firstOrderDiscount + levelDiscount;
  const finalPrice = Math.max(basePrice - totalDiscount, 0);

  return {
    basePrice,
    firstOrderDiscount,
    levelDiscount,
    levelDiscountPercent: discountPercent,
    totalDiscount,
    finalPrice,
  };
}

// Проверка возможности заказа
export type CanOrderResult = {
  allowed: boolean;
  method?: "deposit" | "vibe";
  reason?: "insufficient_funds" | "order_limit" | "blocked" | "no_subscription";
  vibeAvailable?: number;
  depositAvailable?: number;
};

export function canUserOrder({
  deposit,
  referralDeposit,
  isVibePlus,
  depositLimit,
  price,
}: {
  deposit: number;
  referralDeposit: number;
  isVibePlus: boolean;
  depositLimit: number;
  price: number;
}): CanOrderResult {
  const availableBalance = deposit + referralDeposit;

  // Достаточно средств на депозите
  if (availableBalance >= price) {
    return { allowed: true, method: "deposit", depositAvailable: availableBalance };
  }

  // +ВАЙБ может уходить в минус
  if (isVibePlus) {
    const vibeAvailable = availableBalance + depositLimit;
    if (vibeAvailable >= price) {
      return { allowed: true, method: "vibe", vibeAvailable, depositAvailable: availableBalance };
    }
  }

  return { allowed: false, reason: "insufficient_funds" };
}

// Списание средств с депозита
export type DeductionResult = {
  fromReferralDeposit: number;
  fromDeposit: number;
  newReferralDeposit: number;
  newDeposit: number;
};

export function calculateDeduction({
  price,
  deposit,
  referralDeposit,
}: {
  price: number;
  deposit: number;
  referralDeposit: number;
}): DeductionResult {
  let remaining = price;
  let fromReferralDeposit = 0;
  let fromDeposit = 0;

  // Сначала списываем с referral_deposit
  if (referralDeposit > 0) {
    fromReferralDeposit = Math.min(referralDeposit, remaining);
    remaining -= fromReferralDeposit;
  }

  // Затем с deposit (может уйти в минус для +ВАЙБ)
  fromDeposit = remaining;

  return {
    fromReferralDeposit,
    fromDeposit,
    newReferralDeposit: referralDeposit - fromReferralDeposit,
    newDeposit: deposit - fromDeposit,
  };
}

// Форматирование цены
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

// Расчёт прибыли клиента
export function calculateClientProfit({
  salePrice,
  purchasePrice,
}: {
  salePrice: number | null;
  purchasePrice: number;
}): number | null {
  if (salePrice === null) return null;
  return salePrice - purchasePrice;
}

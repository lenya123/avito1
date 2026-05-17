import { formatPrice } from "@/utils/pricing";

// --- Types ---

export type InsightType =
  | "top_product"
  | "high_returns"
  | "level_progress"
  | "potential_profit"
  | "best_size"
  | "milestone"
  | "high_roi_product"
  | "money_cycle"
  | "high_cancel_rate"
  | "profit_concentration"
  | "zero_returns"
  | "first_profit"
  | "roi_declining"
  | "inactive_product"
  | "best_day";

export type InsightSeverity = "positive" | "warning" | "info" | "celebration";

export type Insight = {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  body: string;
  relevance: number; // 0–100, higher = more important
};

// --- Styles for UI rendering ---

export const INSIGHT_STYLES: Record<InsightType, { emoji: string; accentClass: string }> = {
  top_product: { emoji: "🏆", accentClass: "accent-green" },
  high_returns: { emoji: "📦", accentClass: "accent-red" },
  level_progress: { emoji: "📈", accentClass: "accent-blue" },
  potential_profit: { emoji: "💰", accentClass: "[#BF5AF2]" },
  best_size: { emoji: "👕", accentClass: "accent-blue" },
  milestone: { emoji: "🎉", accentClass: "[#BF5AF2]" },
  high_roi_product: { emoji: "💎", accentClass: "accent-green" },
  money_cycle: { emoji: "🔄", accentClass: "accent-blue" },
  high_cancel_rate: { emoji: "❌", accentClass: "accent-red" },
  profit_concentration: { emoji: "⚠️", accentClass: "accent-orange" },
  zero_returns: { emoji: "✅", accentClass: "accent-green" },
  first_profit: { emoji: "🎉", accentClass: "[#BF5AF2]" },
  roi_declining: { emoji: "📉", accentClass: "accent-orange" },
  inactive_product: { emoji: "💤", accentClass: "accent-orange" },
  best_day: { emoji: "📅", accentClass: "accent-blue" },
};

// --- Input data types ---

export type ProductAnalytics = {
  id: string;
  name: string;
  ordersCount: number;
  totalProfit: number;
  returnRate: number;
  roi: number;
};

export type InsightsInput = {
  // Products
  products: ProductAnalytics[];

  // Sizes
  sizes: Record<string, number>;
  totalOrdersForSizes: number;

  // Active orders
  activeOrdersCount: number;
  potentialProfit: number;

  // Period info
  hasOrdersInPeriod: boolean;

  // User data
  totalCompletedOrders: number;
  level: number;
  ordersToNextLevel: number | null;
  nextLevel: number | null;
  nextDiscountPercent: number | null;

  // Money cycle
  avgCycleDays: number;

  // Cancel rate
  cancelRate: number;

  // Total profit (for concentration calc)
  totalProfit: number;

  // Previous period per-product ROI (for roi_declining)
  prevProducts: Array<{ id: string; name: string; roi: number }>;

  // Products ordered in prev period but not in current (for inactive_product)
  inactiveProductNames: string[];

  // Best day of week (for best_day)
  bestDayOfWeek: { day: number; percent: number } | null;
};

// --- Milestones ---

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

// --- Generator ---

export function generateInsights(input: InsightsInput): Insight[] {
  const insights: Insight[] = [];

  // =====================================================
  // Приоритеты (relevance 0–100):
  //   T1  Warnings — деньги теряются      70–95
  //   T2  Risks — рисковые ситуации        60–80
  //   T3  Opportunities — можно заработать  50–72
  //   T4  Context — полезный контекст       35–55
  //   T5  Celebrations — мотивация          55–72
  // =====================================================

  // ---- T1: WARNINGS (70–95) — показываем первыми ----

  // 1. Высокий возврат на товаре (>15%) — берём самый проблемный
  const highReturnCandidates = input.products.filter(
    (p) => p.returnRate > 15 && p.ordersCount >= 3
  );
  const highReturnProduct =
    highReturnCandidates.sort((a, b) => b.returnRate - a.returnRate)[0] || null;
  if (highReturnProduct) {
    const relevance = clamp(65 + Math.round(highReturnProduct.returnRate), 70, 95);
    insights.push({
      type: "high_returns",
      severity: "warning",
      title: "Высокий возврат",
      body: `У «${highReturnProduct.name}» возврат ${Math.round(highReturnProduct.returnRate)}%. Возможно, стоит пересмотреть этот товар или размерную сетку.`,
      relevance,
    });
  }

  // 2. ROI падает на товаре
  if (input.prevProducts.length > 0) {
    for (const curr of input.products) {
      if (curr.ordersCount < 3 || curr.roi <= 0) continue;
      const prev = input.prevProducts.find((p) => p.id === curr.id);
      if (prev && prev.roi > 0) {
        const drop = prev.roi - curr.roi;
        if (drop >= 15) {
          const relevance = clamp(62 + Math.round(drop * 0.5), 68, 90);
          insights.push({
            type: "roi_declining",
            severity: "warning",
            title: "ROI падает",
            body: `ROI на «${curr.name}» снижается: было ${prev.roi}%, стало ${curr.roi}%. Пересмотри цену или замени товар.`,
            relevance,
          });
          break;
        }
      }
    }
  }

  // 3. Много отмен (>15%)
  if (input.cancelRate > 15 && input.hasOrdersInPeriod) {
    const relevance = clamp(60 + Math.round(input.cancelRate), 65, 90);
    insights.push({
      type: "high_cancel_rate",
      severity: "warning",
      title: "Много отмен",
      body: `${Math.round(input.cancelRate)}% заказов отменяются. Проверь описания товаров и актуальность размеров.`,
      relevance,
    });
  }

  // ---- T2: RISKS (60–80) ----

  // 4. Концентрация прибыли (один товар > 70%)
  if (input.totalProfit > 0 && input.products.length >= 2) {
    const topProd = input.products[0];
    if (topProd) {
      const share = Math.round((topProd.totalProfit / input.totalProfit) * 100);
      if (share > 70) {
        const relevance = clamp(55 + Math.round(share * 0.3), 60, 80);
        insights.push({
          type: "profit_concentration",
          severity: "warning",
          title: "Концентрация прибыли",
          body: `«${topProd.name}» — ${share}% всей прибыли. Добавь ещё товары, чтобы снизить риск.`,
          relevance,
        });
      }
    }
  }

  // ---- T3: OPPORTUNITIES (50–72) — actionable ----

  // 5. Высокий ROI на товаре (не дублируем top_product)
  const topProductId = input.products.find((p) => p.ordersCount >= 3)?.id;
  const productsWithRoi = input.products.filter((p) => p.ordersCount >= 3 && p.roi > 0);
  if (productsWithRoi.length >= 2) {
    const avgRoi = productsWithRoi.reduce((sum, p) => sum + p.roi, 0) / productsWithRoi.length;
    const highRoiProduct = productsWithRoi.find(
      (p) => p.roi > avgRoi * 1.3 && p.id !== topProductId
    );
    if (highRoiProduct) {
      const diff = highRoiProduct.roi - avgRoi;
      const relevance = clamp(52 + Math.round(diff * 0.5), 55, 75);
      insights.push({
        type: "high_roi_product",
        severity: "positive",
        title: "Высокий ROI",
        body: `«${highRoiProduct.name}» — ROI ${highRoiProduct.roi}%, выше среднего на ${Math.round(diff)}п.п.`,
        relevance,
      });
    }
  }

  // 6. Лучший размерный ряд
  if (input.totalOrdersForSizes > 5) {
    const sortedSizes = Object.entries(input.sizes).sort(([, a], [, b]) => b - a);
    if (sortedSizes.length > 0) {
      let cumulative = 0;
      const topSizes: string[] = [];
      for (const [size, count] of sortedSizes) {
        cumulative += count;
        topSizes.push(size);
        if (cumulative / input.totalOrdersForSizes >= 0.7) break;
        if (topSizes.length >= 3) break;
      }
      const percent = Math.round((cumulative / input.totalOrdersForSizes) * 100);
      if (percent >= 60 && topSizes.length <= 3) {
        const relevance = clamp(40 + Math.round(percent * 0.4), 50, 68);
        const sizesText = topSizes.join("-");
        insights.push({
          type: "best_size",
          severity: "info",
          title: "Лучший размерный ряд",
          body: `Размеры ${sizesText} дают ${percent}% продаж — фокусируйся на них при выборе товаров.`,
          relevance,
        });
      }
    }
  }

  // 7. Без возвратов (5+ заказов, 0%)
  const zeroReturnProduct = input.products.find((p) => p.ordersCount >= 5 && p.returnRate === 0);
  if (zeroReturnProduct) {
    const relevance = clamp(42 + zeroReturnProduct.ordersCount, 48, 68);
    insights.push({
      type: "zero_returns",
      severity: "positive",
      title: "Без возвратов",
      body: `«${zeroReturnProduct.name}» — ${zeroReturnProduct.ordersCount} заказов и ни одного возврата. Надёжный выбор!`,
      relevance,
    });
  }

  // 8. Почти новый уровень (≤10 заказов)
  if (
    input.ordersToNextLevel !== null &&
    input.nextLevel !== null &&
    input.ordersToNextLevel <= 10 &&
    input.ordersToNextLevel > 0
  ) {
    const relevance = clamp(75 - input.ordersToNextLevel * 3, 50, 72);
    const discountText = input.nextDiscountPercent
      ? ` Скидка вырастет до ${input.nextDiscountPercent}%.`
      : "";
    insights.push({
      type: "level_progress",
      severity: "info",
      title: "Почти новый уровень",
      body: `До уровня ${input.nextLevel} осталось ${input.ordersToNextLevel} ${getOrdersWord(input.ordersToNextLevel)}.${discountText}`,
      relevance,
    });
  }

  // ---- T4: CONTEXT (35–55) — полезный контекст ----

  // 9. Топ-товар
  const topProduct = input.products.find((p) => p.ordersCount >= 3);
  if (topProduct) {
    const profitK = topProduct.totalProfit / 1000;
    const relevance = clamp(38 + Math.round(profitK * 2), 40, 55);
    insights.push({
      type: "top_product",
      severity: "positive",
      title: "Твой топ-товар",
      body: `${topProduct.name} — ${formatPrice(topProduct.totalProfit)} прибыли с ${topProduct.ordersCount} заказов.`,
      relevance,
    });
  }

  // 10. Оборот денег (цикл ≥14 дней)
  if (input.avgCycleDays >= 14) {
    const daysRound = Math.round(input.avgCycleDays);
    const relevance = clamp(35 + Math.round(input.avgCycleDays * 0.5), 38, 55);
    insights.push({
      type: "money_cycle",
      severity: "info",
      title: "Оборот денег",
      body: `Средний цикл от заказа до завершения — ${daysRound} ${getDaysWord(daysRound)}. Это время, пока вложения возвращаются.`,
      relevance,
    });
  }

  // 11. Прибыль на подходе
  if (input.activeOrdersCount > 0 && input.potentialProfit > 0) {
    const profitK = input.potentialProfit / 1000;
    const relevance = clamp(33 + Math.round(profitK * 1.5), 35, 55);
    insights.push({
      type: "potential_profit",
      severity: "info",
      title: "Прибыль на подходе",
      body: `${input.activeOrdersCount} ${getOrdersWord(input.activeOrdersCount)} в доставке. Когда завершатся — прибыль ~${formatPrice(input.potentialProfit)}`,
      relevance,
    });
  }

  // 12. Лучший день недели
  if (input.bestDayOfWeek && input.bestDayOfWeek.percent >= 25) {
    const dayNames = [
      "воскресенье",
      "понедельник",
      "вторник",
      "среду",
      "четверг",
      "пятницу",
      "субботу",
    ];
    const dayName = dayNames[input.bestDayOfWeek.day] || "—";
    const relevance = clamp(30 + Math.round(input.bestDayOfWeek.percent * 0.6), 38, 55);
    insights.push({
      type: "best_day",
      severity: "info",
      title: "Лучший день",
      body: `Больше всего заказов в ${dayName} (${input.bestDayOfWeek.percent}%). Держи этот день в фокусе.`,
      relevance,
    });
  }

  // 13. Неактивный товар
  if (input.inactiveProductNames.length > 0) {
    const name = input.inactiveProductNames[0];
    const relevance = clamp(32 + input.inactiveProductNames.length * 5, 35, 52);
    insights.push({
      type: "inactive_product",
      severity: "info",
      title: "Неактивный товар",
      body:
        input.inactiveProductNames.length === 1
          ? `«${name}» — был в прошлом периоде, но сейчас ни одного заказа. Подумай о замене.`
          : `«${name}» и ещё ${input.inactiveProductNames.length - 1} — были в прошлом периоде, но сейчас без заказов.`,
      relevance,
    });
  }

  // ---- T5: CELEBRATIONS ----

  // 14. Первая прибыль (1–5 заказов)
  if (input.totalCompletedOrders >= 1 && input.totalCompletedOrders <= 5 && input.totalProfit > 0) {
    insights.push({
      type: "first_profit",
      severity: "celebration",
      title: "Первая прибыль!",
      body: `Ты заработал ${formatPrice(input.totalProfit)} с ${input.totalCompletedOrders} ${getOrdersWord(input.totalCompletedOrders)}. Отличный старт!`,
      relevance: 72,
    });
  }

  // 15. Milestone
  const milestone = MILESTONES.find((m) => input.totalCompletedOrders === m);
  if (milestone) {
    const milestoneIdx = MILESTONES.indexOf(milestone);
    const relevance = 55 + Math.round((milestoneIdx / (MILESTONES.length - 1)) * 13);
    insights.push({
      type: "milestone",
      severity: "celebration",
      title: "Поздравляем!",
      body: `${milestone}-й завершённый заказ! Ты растёшь как профи.`,
      relevance,
    });
  }

  // --- Balanced selection: top 6 with at least 1 positive if available ---
  return selectBalanced(insights, 6);
}

/**
 * Select top N insights by relevance, but guarantee at least 1 positive/celebration
 * insight if any exist. This prevents a wall of warnings when things are mostly fine.
 */
function selectBalanced(insights: Insight[], count: number): Insight[] {
  const sorted = insights.sort((a, b) => b.relevance - a.relevance);
  const top = sorted.slice(0, count);

  const hasPositive = top.some((i) => i.severity === "positive" || i.severity === "celebration");

  if (!hasPositive) {
    const bestPositive = sorted.find(
      (i) => (i.severity === "positive" || i.severity === "celebration") && !top.includes(i)
    );
    if (bestPositive) {
      top[top.length - 1] = bestPositive;
    }
  }

  return top;
}

// --- Helpers ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getDaysWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}

function getOrdersWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "заказов";
  if (lastDigit === 1) return "заказ";
  if (lastDigit >= 2 && lastDigit <= 4) return "заказа";
  return "заказов";
}

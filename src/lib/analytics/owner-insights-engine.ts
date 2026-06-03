import type { InsightSeverity } from "./insights-engine";

// ===== Types =====

export type OwnerInsightType =
  | "margin_erosion"
  | "stock_velocity_warning"
  | "dead_stock"
  | "top_client_dependency"
  | "return_rate_alert"
  | "client_churn_risk"
  | "revenue_change"
  | "fulfillment_slowdown"
  | "new_product_flop"
  | "revenue_record";

export type OwnerInsight = {
  type: OwnerInsightType;
  severity: InsightSeverity;
  title: string;
  body: string;
  relevance: number;
};

export const OWNER_INSIGHT_STYLES: Record<
  OwnerInsightType,
  { emoji: string; accentClass: string }
> = {
  margin_erosion: { emoji: "📉", accentClass: "accent-red" },
  stock_velocity_warning: { emoji: "⏰", accentClass: "accent-orange" },
  dead_stock: { emoji: "💤", accentClass: "accent-orange" },
  top_client_dependency: { emoji: "⚠️", accentClass: "accent-orange" },
  return_rate_alert: { emoji: "📦", accentClass: "accent-red" },
  client_churn_risk: { emoji: "👋", accentClass: "accent-orange" },
  revenue_change: { emoji: "📊", accentClass: "accent-blue" },
  fulfillment_slowdown: { emoji: "🐌", accentClass: "accent-orange" },
  new_product_flop: { emoji: "📉", accentClass: "accent-orange" },
  revenue_record: { emoji: "🎉", accentClass: "accent-green" },
};

// ===== Input =====

export interface OwnerInsightsInput {
  revenue: number;
  profit: number;
  roiPercent: number;
  aov: number;
  prevRevenue: number | null;
  prevProfit: number | null;
  prevRoiPercent: number | null;
  prevAov: number | null;

  products: Array<{
    id: string;
    name: string;
    revenue: number;
    profit: number;
    roiPercent: number;
    returnRate: number;
    stockRemaining: number;
    velocityPerDay: number;
    daysOfStock: number | null;
    ordersInPeriod: number;
    lastOrderDate: string | null;
    createdAt: string;
  }>;

  totalClients: number;
  activeClients: number;
  revenueByClient: Array<{ id: string; username: string; revenue: number }>;
  churnedClients: number;

  avgFulfillmentDays: number;

  categories: Array<{
    name: string;
    revenue: number;
    profit: number;
    roiPercent: number;
  }>;
}

// ===== Generator =====

export function generateOwnerInsights(input: OwnerInsightsInput): OwnerInsight[] {
  const insights: OwnerInsight[] = [];

  // --- T1: WARNINGS (70–95) ---

  // 1. ROI erosion
  if (input.prevRoiPercent !== null && input.roiPercent < input.prevRoiPercent) {
    const drop = input.prevRoiPercent - input.roiPercent;
    if (drop >= 3) {
      const relevance = clamp(65 + drop * 2, 70, 95);
      insights.push({
        type: "margin_erosion",
        severity: "warning",
        title: "ROI падает",
        body: `ROI снизился с ${input.prevRoiPercent}% до ${input.roiPercent}% (−${drop}п.п.). → Проверьте себестоимость товаров.`,
        relevance,
      });
    }
  }

  // 2. Stock velocity warning — top-selling product running low
  const productsWithSales = input.products.filter(
    (p) => p.velocityPerDay > 0 && p.stockRemaining > 0
  );
  const lowStockProducts = productsWithSales
    .filter((p) => p.daysOfStock !== null && p.daysOfStock <= 7)
    .sort((a, b) => (a.daysOfStock || 0) - (b.daysOfStock || 0));

  if (lowStockProducts.length > 0) {
    const p = lowStockProducts[0];
    const days = p.daysOfStock || 0;
    const relevance = clamp(80 - days * 3, 70, 92);
    insights.push({
      type: "stock_velocity_warning",
      severity: "warning",
      title: "Товар заканчивается",
      body: `«${p.name}» — осталось на ~${days} дн. (${p.stockRemaining} шт.). → Дозакажите.`,
      relevance,
    });
  }

  // 3. Return rate alert
  const highReturnProducts = input.products
    .filter((p) => p.returnRate > 15 && p.ordersInPeriod >= 3)
    .sort((a, b) => b.returnRate - a.returnRate);

  if (highReturnProducts.length > 0) {
    const p = highReturnProducts[0];
    const relevance = clamp(65 + p.returnRate, 70, 92);
    insights.push({
      type: "return_rate_alert",
      severity: "warning",
      title: "Высокий % возвратов",
      body: `«${p.name}» — ${p.returnRate}% возвратов. → Проверьте описание и фото.`,
      relevance,
    });
  }

  // --- T2: RISKS (60–80) ---

  // 4. Top client dependency / concentration
  if (input.revenueByClient.length >= 2 && input.revenue > 0) {
    const topClient = input.revenueByClient[0];
    const topOneShare = Math.round((topClient.revenue / input.revenue) * 100);
    const topThreeRevenue = input.revenueByClient.slice(0, 3).reduce((s, c) => s + c.revenue, 0);
    const topThreeShare = Math.round((topThreeRevenue / input.revenue) * 100);

    if (topOneShare > 25) {
      const relevance = clamp(55 + Math.round(topOneShare * 0.4), 60, 80);
      insights.push({
        type: "top_client_dependency",
        severity: "warning",
        title: "Зависимость от клиента",
        body: `@${topClient.username} — ${topOneShare}% выручки. → Диверсифицируйте клиентскую базу.`,
        relevance,
      });
    } else if (topThreeShare > 50) {
      const relevance = clamp(55 + Math.round(topThreeShare * 0.3), 60, 78);
      insights.push({
        type: "top_client_dependency",
        severity: "warning",
        title: "Концентрация выручки",
        body: `Топ-3 клиента дают ${topThreeShare}% выручки. → Привлекайте новых клиентов для устойчивости.`,
        relevance,
      });
    }
  }

  // 5. Client churn risk
  if (input.churnedClients >= 3) {
    const relevance = clamp(55 + input.churnedClients * 3, 60, 78);
    insights.push({
      type: "client_churn_risk",
      severity: "warning",
      title: "Клиенты уходят",
      body: `${input.churnedClients} клиентов были активны, но не заказывали в этом периоде. → Свяжитесь или предложите промо.`,
      relevance,
    });
  }

  // 6. Dead stock
  const now = new Date();
  const deadStockProducts = input.products.filter((p) => {
    if (p.stockRemaining <= 0) return false;
    if (p.ordersInPeriod > 0) return false;
    if (!p.lastOrderDate) return true;
    const daysSince = (now.getTime() - new Date(p.lastOrderDate).getTime()) / 86400000;
    return daysSince > 30;
  });

  if (deadStockProducts.length > 0) {
    const p = deadStockProducts[0];
    const relevance = clamp(55 + deadStockProducts.length * 5, 58, 75);
    const extra = deadStockProducts.length > 1 ? ` и ещё ${deadStockProducts.length - 1}` : "";
    insights.push({
      type: "dead_stock",
      severity: "warning",
      title: "Залежалый товар",
      body: `«${p.name}»${extra} — нет продаж 30+ дней (${p.stockRemaining} шт.). → Уцените или снимите.`,
      relevance,
    });
  }

  // --- T3: OPPORTUNITIES (50–72) ---

  // 7. Revenue change (significant)
  if (input.prevRevenue !== null && input.prevRevenue > 0) {
    const change = Math.round(((input.revenue - input.prevRevenue) / input.prevRevenue) * 100);
    if (Math.abs(change) >= 20) {
      const relevance = clamp(48 + Math.abs(change) * 0.3, 52, 70);
      if (change > 0) {
        insights.push({
          type: "revenue_change",
          severity: "positive",
          title: "Выручка растёт",
          body: `Выручка выросла на ${change}% по сравнению с прошлым периодом. Отличная динамика!`,
          relevance,
        });
      } else {
        insights.push({
          type: "revenue_change",
          severity: "warning",
          title: "Выручка падает",
          body: `Выручка снизилась на ${Math.abs(change)}%. → Проверьте ассортимент и активность клиентов.`,
          relevance: relevance + 10,
        });
      }
    }
  }

  // 8. Fulfillment slowdown
  if (input.avgFulfillmentDays > 2) {
    const days = Math.round(input.avgFulfillmentDays * 10) / 10;
    const relevance = clamp(60 + Math.round(days * 5), 65, 85);
    insights.push({
      type: "fulfillment_slowdown",
      severity: "warning",
      title: "Отправка тормозит",
      body: `Среднее время отправки — ${days} дн. Клиенты ждут дольше обычного. → Проверьте загрузку отправщиков.`,
      relevance,
    });
  }

  // 9. New product flop
  const flopProducts = input.products.filter((p) => {
    const ageMs = now.getTime() - new Date(p.createdAt).getTime();
    const ageDays = ageMs / 86400000;
    return ageDays >= 14 && p.ordersInPeriod < 2 && p.stockRemaining > 0;
  });

  if (flopProducts.length > 0) {
    const p = flopProducts[0];
    const ageDays = Math.round((now.getTime() - new Date(p.createdAt).getTime()) / 86400000);
    const relevance = clamp(50 + flopProducts.length * 4, 55, 72);
    const extra = flopProducts.length > 1 ? ` и ещё ${flopProducts.length - 1}` : "";
    insights.push({
      type: "new_product_flop",
      severity: "warning",
      title: "Провал новинки",
      body: `«${p.name}»${extra} — добавлен ${ageDays} дн. назад, всего ${p.ordersInPeriod} продаж. → Проверьте фото, описание, цену.`,
      relevance,
    });
  }

  // 10. Revenue record
  if (input.prevRevenue !== null && input.prevRevenue > 0 && input.revenue > 0) {
    const change = Math.round(((input.revenue - input.prevRevenue) / input.prevRevenue) * 100);
    if (change >= 50) {
      const relevance = clamp(48 + Math.round(change * 0.2), 50, 65);
      insights.push({
        type: "revenue_record",
        severity: "celebration",
        title: "Рекордная выручка",
        body: `Выручка за период — ${formatRub(input.revenue)}! Рост ${change}% к прошлому периоду.`,
        relevance,
      });
    }
  }

  return selectBalanced(insights, 6);
}

// ===== Helpers =====

function selectBalanced(insights: OwnerInsight[], count: number): OwnerInsight[] {
  const sorted = insights.sort((a, b) => b.relevance - a.relevance);
  const top = sorted.slice(0, count);

  const hasPositive = top.some((i) => i.severity === "positive" || i.severity === "celebration");

  if (!hasPositive) {
    const bestPositive = sorted.find(
      (i) => (i.severity === "positive" || i.severity === "celebration") && !top.includes(i)
    );
    if (bestPositive && top.length > 0) {
      top[top.length - 1] = bestPositive;
    }
  }

  return top;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

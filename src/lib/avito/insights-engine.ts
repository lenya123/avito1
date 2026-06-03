export type AvitoInsightSeverity = "positive" | "warning" | "info" | "celebration";

export interface AvitoInsight {
  type: string;
  severity: AvitoInsightSeverity;
  title: string;
  body: string;
}

interface AvitoInsightInput {
  stats: {
    totalViews: number;
    totalFavorites: number;
    totalContacts: number;
    totalChats: number;
    unreadChats: number;
    rating: { score: number; total_reviews: number } | null;
  };
  unansweredReviews: number;
}

export function generateAvitoInsights(input: AvitoInsightInput): AvitoInsight[] {
  const { stats, unansweredReviews } = input;
  const insights: AvitoInsight[] = [];

  // Unread chats
  if (stats.unreadChats > 3) {
    insights.push({
      type: "avito_unread_chats",
      severity: "warning",
      title: `${stats.unreadChats} непрочитанных чатов`,
      body: "Быстрые ответы повышают конверсию и позиции в выдаче",
    });
  }

  // Unanswered reviews
  if (unansweredReviews > 0) {
    insights.push({
      type: "avito_unanswered_reviews",
      severity: "warning",
      title: `${unansweredReviews} ${unansweredReviews === 1 ? "отзыв" : "отзывов"} без ответа`,
      body: "Ответы на отзывы повышают доверие покупателей",
    });
  }

  // Low conversion
  if (stats.totalViews > 500 && stats.totalContacts / stats.totalViews < 0.01) {
    const pct = ((stats.totalContacts / stats.totalViews) * 100).toFixed(2);
    insights.push({
      type: "avito_low_conversion",
      severity: "warning",
      title: `Низкая конверсия в контакты (${pct}%)`,
      body: "Проверьте фото, описания и цены объявлений",
    });
  }

  // High favorites ratio
  if (stats.totalViews > 100 && stats.totalFavorites / stats.totalViews > 0.05) {
    const pct = ((stats.totalFavorites / stats.totalViews) * 100).toFixed(1);
    insights.push({
      type: "avito_high_favorites",
      severity: "positive",
      title: `Высокий % избранного (${pct}%)`,
      body: "Товары привлекают внимание — это хороший сигнал",
    });
  }

  // Great rating
  if (stats.rating && stats.rating.score >= 4.5 && stats.rating.total_reviews >= 5) {
    insights.push({
      type: "avito_great_rating",
      severity: "celebration",
      title: `Отличный рейтинг ${stats.rating.score.toFixed(1)}`,
      body: "Это повышает позиции в выдаче и доверие покупателей",
    });
  }

  return insights;
}

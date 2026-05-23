/**
 * Маппинг строки users → AuthUser-объект, который ожидает фронт.
 * Вынесено из route.ts, потому что Next.js разрешает в route-файлах
 * только специальные именованные экспорты (GET/POST/...).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOperatorUser(user: any) {
  return {
    id: user.id,
    role: user.role,
    name: user.name || "Оператор",
    avatarUrl: user.avatar_url || null,
    telegramUsername: user.telegram_username || null,
    level: user.level ?? 3,
    deposit: user.deposit ?? 0,
    referralDeposit: user.referral_deposit ?? 0,
    depositLimit: user.deposit_limit ?? 0,
    isVibePlus: !!user.is_vibe_plus,
    subscriptionTier: user.subscription_tier ?? "top_floor_boss",
    subscriptionEnd: user.subscription_end ?? null,
    scheduledSubscriptionTier: null,
    discountPercent: user.discount_percent ?? 0,
    completedOrdersCount: user.total_completed_orders ?? 0,
    referralCode: user.referral_code ?? null,
    referralCount: 0,
    referralEarned: 0,
    isOnboardingCompleted: true,
    firstOrderDiscountUsed: !!user.first_order_discount_used,
    notificationSettings: {
      orderStatus: user.notification_order_status ?? true,
      newProducts: user.notification_new_products ?? true,
      promotions: user.notification_promotions ?? true,
    },
    hasAvitoCredentials: !!(user.avito_client_id && user.avito_client_secret),
    avitoAccountLimit: user.avito_account_limit ?? 0,
  };
}

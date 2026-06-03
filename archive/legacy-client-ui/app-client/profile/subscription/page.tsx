"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUserLevel } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth-store";
import {
  useSubscription,
  useSubscriptionChange,
  useCancelScheduledSubscription,
} from "@/hooks/use-subscription";
import { cn } from "@/utils/cn";
import { Button, Modal } from "@/components/ui";
import { TFB_VARIANTS } from "@/lib/constants/subscriptions";
import type { SubscriptionTier } from "@/types/database";

// ВАЖНО: При изменении подписок — синхронизируй с @/lib/constants/subscriptions.ts
const TIERS: {
  tier: SubscriptionTier;
  name: string;
  price: string;
  priceValue: number;
  features: string[];
  color: string;
  gradient: string;
  popular?: boolean;
}[] = [
  {
    tier: "basic",
    name: "Basic",
    price: "500",
    priceValue: 500,
    features: ["Доступ к каталогу", "3 заказа в день", "Статистика продаж", "Push-уведомления"],
    color: "text-white",
    gradient: "from-white/[0.12] to-white/[0.06]",
  },
  {
    tier: "premium",
    name: "Premium",
    price: "5 000",
    priceValue: 5000,
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
    color: "text-accent-blue",
    gradient: "from-accent-blue/20 to-accent-blue/8",
    popular: true,
  },
  {
    tier: "top_floor_boss",
    name: "Top Floor Boss",
    price: "10 000",
    priceValue: 10000,
    features: [
      "Всё из Premium",
      "Подключение Avito магазинов",
      "AI отвечает покупателям",
      "Статистика заказов по API",
      "Автопубликация объявлений",
      "Генерация фото через AI",
      "Персональные консультации",
    ],
    color: "text-accent-green",
    gradient: "from-accent-green/20 to-accent-green/8",
  },
];

// Порядок тарифов для определения upgrade/downgrade
const TIER_ORDER: SubscriptionTier[] = ["none", "basic", "premium", "top_floor_boss"];

// Цены для +ВАЙБ: Premium бесплатно, Top Floor Boss со скидкой
const VIBE_PLUS_PRICES: Partial<
  Record<SubscriptionTier, { price: string; priceValue: number; originalPrice?: string }>
> = {
  premium: { price: "0", priceValue: 0, originalPrice: "5 000" },
  top_floor_boss: { price: "7 000", priceValue: 7000, originalPrice: "10 000" },
};

function formatPrice(value: number): string {
  return value.toLocaleString("ru-RU");
}

export default function SubscriptionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const { isVibePlus } = useUserLevel();
  const currentTier = user?.subscriptionTier ?? "none";
  const currentAccountLimit = user?.avitoAccountLimit ?? 1;
  const { scheduledTier } = useSubscription();

  // Состояние модального окна
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [tfbAccounts, setTfbAccounts] = useState<1 | 2 | 3>(
    (currentTier === "top_floor_boss" ? currentAccountLimit : 1) as 1 | 2 | 3
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Мутации
  const changeSubscription = useSubscriptionChange();
  const cancelScheduled = useCancelScheduledSubscription();

  // Определяем тип изменения
  const getChangeType = (newTier: SubscriptionTier) => {
    const currentIndex = TIER_ORDER.indexOf(currentTier);
    const newIndex = TIER_ORDER.indexOf(newTier);
    return newIndex > currentIndex ? "upgrade" : "downgrade";
  };

  // Получаем цену для тарифа
  const getTierPrice = (tier: SubscriptionTier) => {
    if (tier === "top_floor_boss") {
      const variant = TFB_VARIANTS.find((v) => v.accounts === tfbAccounts) ?? TFB_VARIANTS[0];
      if (isVibePlus) {
        return {
          price: formatPrice(variant.priceVibe),
          priceValue: variant.priceVibe,
          originalPrice: formatPrice(variant.price),
        };
      }
      return { price: formatPrice(variant.price), priceValue: variant.price };
    }

    const tierData = TIERS.find((t) => t.tier === tier);
    if (!tierData) return { price: "0", priceValue: 0 };

    if (isVibePlus && VIBE_PLUS_PRICES[tier]) {
      return VIBE_PLUS_PRICES[tier]!;
    }

    return { price: tierData.price, priceValue: tierData.priceValue };
  };

  // Обработчик смены тарифа
  const handleChangeTier = async () => {
    if (!selectedTier || selectedTier === "none") return;

    try {
      const result = await changeSubscription.mutateAsync({
        tier: selectedTier,
        ...(selectedTier === "top_floor_boss" ? { avitoAccountLimit: tfbAccounts } : {}),
      });
      setSuccessMessage(result.message);
      setSelectedTier(null);
      checkAuth();
    } catch {
      // Ошибка обрабатывается в mutation
    }
  };

  // Обработчик смены варианта TFB (без смены тарифа)
  const handleChangeTfbVariant = async () => {
    if (tfbAccounts === currentAccountLimit) return;

    try {
      const result = await changeSubscription.mutateAsync({
        tier: "top_floor_boss",
        avitoAccountLimit: tfbAccounts,
      });
      setSuccessMessage(result.message);
      checkAuth();
    } catch {
      // Ошибка обрабатывается в mutation
    }
  };

  // Закрыть модалку успеха
  const closeSuccessModal = () => {
    setSuccessMessage(null);
  };

  const selectedTierData = selectedTier ? TIERS.find((t) => t.tier === selectedTier) : null;
  const changeType = selectedTier ? getChangeType(selectedTier) : null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/60 hover:text-white/80 transition-colors mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="text-sm">Назад</span>
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Подписки</h1>
          {isVibePlus && (
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-md",
                "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
                "border border-accent-green/25",
                "text-accent-green"
              )}
            >
              +ВАЙБ цены
            </span>
          )}
        </div>
        <p className="text-sm text-white/60 mt-1">
          {isVibePlus
            ? "Специальные цены для клиентов +ВАЙБ"
            : "Выберите тариф, который подходит вашему бизнесу"}
        </p>
      </motion.div>

      {/* Current subscription info */}
      {currentTier !== "none" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={cn(
            "relative mb-6 p-4 rounded-2xl overflow-hidden",
            "bg-gradient-to-br from-white/[0.10] to-white/[0.05]",
            "backdrop-blur-xl",
            "border border-glass",
            "shadow-card"
          )}
        >
          {/* Decorative line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="flex items-center gap-3 relative">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
                "border border-accent-green/25"
              )}
            >
              <svg
                className="w-5 h-5 text-accent-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                Текущая подписка:{" "}
                <span className={TIERS.find((t) => t.tier === currentTier)?.color}>
                  {TIERS.find((t) => t.tier === currentTier)?.name}
                </span>
                {currentTier === "top_floor_boss" && (
                  <span className="text-white/40 font-normal">
                    {" "}
                    (
                    {TFB_VARIANTS.find((v) => v.accounts === currentAccountLimit)?.label ??
                      `${currentAccountLimit} акк.`}
                    )
                  </span>
                )}
              </p>
              {user?.subscriptionEnd && (
                <p className="text-xs text-white/40 mt-0.5">
                  Активна до{" "}
                  {new Date(user.subscriptionEnd).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tiers grid */}
      <div className={cn("grid gap-4", isVibePlus ? "md:grid-cols-2" : "md:grid-cols-3")}>
        {TIERS.filter((t) => !(isVibePlus && t.tier === "basic")).map((tier, index) => {
          const isCurrent = tier.tier === currentTier;
          const isScheduled = tier.tier === scheduledTier;
          const priceInfo = getTierPrice(tier.tier);
          const isFree = priceInfo.price === "0";
          const isTfb = tier.tier === "top_floor_boss";

          return (
            <motion.div
              key={tier.tier}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className={cn(
                "relative p-5 rounded-2xl overflow-hidden flex flex-col",
                "backdrop-blur-xl",
                "border transition-all duration-200",
                isCurrent
                  ? [
                      "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                      "border-glass-strong",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_rgba(94,92,230,0.15),inset_0_1px_0_rgba(255,255,255,0.2)]",
                    ]
                  : [
                      "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                      "border-glass",
                      "shadow-card",
                    ]
              )}
            >
              {/* Decorative line */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

              {/* Badge */}
              {isCurrent ? (
                <div
                  className={cn(
                    "absolute top-3 right-3",
                    "px-2 py-0.5 rounded-md",
                    "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
                    "border border-glass-subtle",
                    "text-xs font-medium text-accent-green"
                  )}
                >
                  Текущий
                </div>
              ) : isScheduled ? (
                <div
                  className={cn(
                    "absolute top-3 right-3",
                    "px-2 py-0.5 rounded-md",
                    "bg-gradient-to-br from-accent-blue/15 to-accent-blue/5",
                    "border border-accent-blue/25",
                    "text-xs font-medium text-accent-blue"
                  )}
                >
                  Следующий
                </div>
              ) : tier.popular ? (
                <div
                  className={cn(
                    "absolute top-3 right-3",
                    "px-2 py-0.5 rounded-md",
                    "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
                    "border border-glass-subtle",
                    "text-xs font-medium text-accent-blue"
                  )}
                >
                  Популярный
                </div>
              ) : null}

              {/* Content */}
              <div className="relative flex-1">
                <h3 className={cn("text-lg font-bold mb-1", tier.color)}>{tier.name}</h3>
                {/* Цены */}
                <div className="flex items-baseline gap-2 mb-4">
                  {isFree ? (
                    <span className="text-2xl font-bold text-accent-green">Бесплатно</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-white">{priceInfo.price}₽</span>
                      <span className="text-sm text-white/40">/ месяц</span>
                    </>
                  )}
                  {"originalPrice" in priceInfo && priceInfo.originalPrice && (
                    <span className="text-sm text-white/40 line-through">
                      {priceInfo.originalPrice}₽
                    </span>
                  )}
                </div>

                {/* TFB account selector */}
                {isTfb && (
                  <div className="mb-4">
                    <div
                      className={cn(
                        "flex gap-1 p-1 rounded-xl",
                        "bg-gradient-to-b from-white/[0.06] to-white/[0.03]",
                        "border border-glass"
                      )}
                    >
                      {TFB_VARIANTS.map((variant) => (
                        <button
                          key={variant.accounts}
                          onClick={() => setTfbAccounts(variant.accounts as 1 | 2 | 3)}
                          className={cn(
                            "flex-1 py-1.5 text-xs font-medium rounded-lg transition-all",
                            tfbAccounts === variant.accounts
                              ? "bg-white/[0.12] text-white"
                              : "text-white/50 hover:text-white/70"
                          )}
                        >
                          {variant.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Features */}
                <div className="space-y-2.5">
                  {tier.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center",
                          "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
                          "border border-glass-subtle"
                        )}
                      >
                        <svg
                          className={cn("w-3 h-3", tier.color)}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <span className="text-sm text-white/60 leading-5">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action button */}
              {isCurrent && isTfb && tfbAccounts !== currentAccountLimit ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full mt-4"
                  onClick={handleChangeTfbVariant}
                  isLoading={changeSubscription.isPending}
                >
                  {tfbAccounts > currentAccountLimit
                    ? `Расширить до ${tfbAccounts}-х аккаунтов`
                    : `Сократить до ${tfbAccounts}-го аккаунта`}
                </Button>
              ) : !isCurrent && !isScheduled ? (
                <Button
                  variant={tier.popular ? "primary" : "secondary"}
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => setSelectedTier(tier.tier)}
                >
                  {currentTier === "none"
                    ? "Оформить"
                    : getChangeType(tier.tier) === "upgrade"
                      ? "Улучшить"
                      : "Выбрать"}
                </Button>
              ) : null}

              {/* Scheduled tier info */}
              {isScheduled && user?.subscriptionEnd && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-white/40 text-center">
                    Активируется с{" "}
                    {new Date(user.subscriptionEnd).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => cancelScheduled.mutate()}
                    isLoading={cancelScheduled.isPending}
                  >
                    Отменить
                  </Button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Info notice */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="mt-6 space-y-1.5"
      >
        <p className="text-center text-white/40 text-xs">
          Upgrade: мгновенная активация нового тарифа
        </p>
        <p className="text-center text-white/40 text-xs">
          Downgrade: новый тариф после окончания текущего
        </p>
      </motion.div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {selectedTier && selectedTierData && (
          <Modal
            isOpen={!!selectedTier}
            onClose={() => setSelectedTier(null)}
            title={changeType === "upgrade" ? "Улучшить подписку" : "Изменить подписку"}
          >
            <div className="space-y-4">
              <p className="text-white/60">
                {changeType === "upgrade" ? (
                  <>
                    Вы переходите на тариф{" "}
                    <span className={selectedTierData.color}>{selectedTierData.name}</span>
                    {selectedTier === "top_floor_boss" && (
                      <span className="text-white/40">
                        {" "}
                        ({TFB_VARIANTS.find((v) => v.accounts === tfbAccounts)?.label})
                      </span>
                    )}
                    . Подписка будет активирована сразу на 30 дней.
                  </>
                ) : (
                  <>
                    Вы переходите на тариф{" "}
                    <span className={selectedTierData.color}>{selectedTierData.name}</span>.
                    {user?.subscriptionEnd && new Date(user.subscriptionEnd) > new Date() ? (
                      <> Новый тариф активируется после окончания текущей подписки.</>
                    ) : (
                      <> Подписка будет активирована сразу на 30 дней.</>
                    )}
                  </>
                )}
              </p>

              {/* Price info */}
              <div
                className={cn(
                  "p-4 rounded-xl",
                  "bg-gradient-to-br from-white/[0.08] to-white/[0.04]",
                  "border border-glass-subtle"
                )}
              >
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Стоимость</span>
                  <span className="text-lg font-semibold text-white">
                    {getTierPrice(selectedTier).price === "0"
                      ? "Бесплатно"
                      : `${getTierPrice(selectedTier).price}₽`}
                  </span>
                </div>
              </div>

              {/* Note about payment */}
              <p className="text-xs text-white/40">
                Примечание: оплата подписок временно доступна только через Telegram бот. Эта функция
                находится в разработке.
              </p>

              {changeSubscription.error && (
                <p className="text-sm text-accent-red">{changeSubscription.error.message}</p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setSelectedTier(null)}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleChangeTier}
                  isLoading={changeSubscription.isPending}
                >
                  Подтвердить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {successMessage && (
          <Modal isOpen={!!successMessage} onClose={closeSuccessModal} title="Готово!">
            <div className="space-y-4">
              <div className="flex justify-center">
                <div
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center",
                    "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
                    "border border-accent-green/25",
                    "shadow-[0_4px_12px_rgba(52,199,89,0.15)]"
                  )}
                >
                  <svg
                    className="w-7 h-7 text-accent-green"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-center text-white/80">{successMessage}</p>
              <Button className="w-full" onClick={closeSuccessModal}>
                Отлично
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </main>
  );
}

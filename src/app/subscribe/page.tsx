"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUserLevel } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth-store";
import { useSubscription, useSubscriptionChange } from "@/hooks/use-subscription";
import { cn } from "@/utils/cn";
import { Button, Modal, Spinner } from "@/components/ui";
import { TFB_VARIANTS } from "@/lib/constants/subscriptions";
import type { SubscriptionTier } from "@/types/database";

const TIERS: {
  tier: SubscriptionTier;
  name: string;
  price: string;
  priceValue: number;
  features: string[];
  color: string;
  popular?: boolean;
}[] = [
  {
    tier: "basic",
    name: "Basic",
    price: "500",
    priceValue: 500,
    features: ["Доступ к каталогу", "3 заказа в день", "Статистика продаж", "Push-уведомления"],
    color: "text-white",
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
  },
];

const VIBE_PLUS_PRICES: Partial<
  Record<SubscriptionTier, { price: string; priceValue: number; originalPrice?: string }>
> = {
  premium: { price: "0", priceValue: 0, originalPrice: "5 000" },
  top_floor_boss: { price: "7 000", priceValue: 7000, originalPrice: "10 000" },
};

function formatPrice(value: number): string {
  return value.toLocaleString("ru-RU");
}

export default function SubscribePage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const { isVibePlus } = useUserLevel();
  const { hasAccess, tier: currentTier, isActive: isSubscriptionActive } = useSubscription();
  const isExpiredSubscription = currentTier !== "none" && !isSubscriptionActive;

  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [tfbAccounts, setTfbAccounts] = useState<1 | 2 | 3>(1);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const changeSubscription = useSubscriptionChange();

  useEffect(() => {
    checkAuth().finally(() => setIsChecking(false));
  }, [checkAuth]);

  useEffect(() => {
    if (!isChecking && hasAccess) {
      router.replace("/catalog");
    }
  }, [isChecking, hasAccess, router]);

  if (isChecking || hasAccess) {
    return (
      <div className="min-h-dvh bg-primary flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

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

  const handleSelectTier = async () => {
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

  const handleSuccess = () => {
    setSuccessMessage(null);
    router.push("/catalog");
  };

  const selectedTierData = selectedTier ? TIERS.find((t) => t.tier === selectedTier) : null;

  return (
    <div className="min-h-dvh bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-glass">
        <span className="text-sm text-white/60">{user?.name || "Клиент"}</span>
        <button
          onClick={logout}
          className="text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          Выйти
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-white mb-2">
            {isExpiredSubscription ? "Подписка истекла" : "Выберите подписку"}
          </h1>
          <p className="text-sm text-white/60 max-w-md mx-auto">
            {isExpiredSubscription
              ? `Ваш тариф ${TIERS.find((t) => t.tier === currentTier)?.name} больше не активен. Продлите или выберите другой тариф.`
              : "Для доступа к каталогу и оформления заказов необходима активная подписка"}
          </p>
          {isVibePlus && (
            <span
              className={cn(
                "inline-block mt-3 text-xs font-medium px-2 py-0.5 rounded-md",
                "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
                "border border-accent-green/25",
                "text-accent-green"
              )}
            >
              +ВАЙБ цены
            </span>
          )}
        </motion.div>

        {/* Tiers */}
        <div className={cn("grid gap-4", isVibePlus ? "md:grid-cols-2" : "md:grid-cols-3")}>
          {TIERS.filter((t) => !(isVibePlus && t.tier === "basic")).map((tier, index) => {
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
                  "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                  "border border-glass",
                  "shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
                )}
              >
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                {isExpiredSubscription && tier.tier === currentTier ? (
                  <div
                    className={cn(
                      "absolute top-3 right-3",
                      "px-2 py-0.5 rounded-md",
                      "bg-gradient-to-br from-accent-red/20 to-accent-red/10",
                      "border border-accent-red/25",
                      "text-xs font-medium text-accent-red"
                    )}
                  >
                    Истекла
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

                <div className="relative flex-1">
                  <h3 className={cn("text-lg font-bold mb-1", tier.color)}>{tier.name}</h3>
                  <div className="flex items-baseline gap-2 mb-4">
                    {isFree ? (
                      <span className="text-2xl font-bold text-accent-green">Бесплатно</span>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-white">{priceInfo.price}₽</span>
                        <span className="text-sm text-white/50">/ месяц</span>
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
                        <span className="text-sm text-white/70 leading-5">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  variant={
                    tier.popular || (isExpiredSubscription && tier.tier === currentTier)
                      ? "primary"
                      : "secondary"
                  }
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => setSelectedTier(tier.tier)}
                >
                  {isExpiredSubscription && tier.tier === currentTier ? "Продлить" : "Выбрать"}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {selectedTier && selectedTierData && (
          <Modal
            isOpen={!!selectedTier}
            onClose={() => setSelectedTier(null)}
            title={
              isExpiredSubscription && selectedTier === currentTier
                ? "Продлить подписку"
                : "Оформить подписку"
            }
          >
            <div className="space-y-4">
              <p className="text-white/70">
                {isExpiredSubscription && selectedTier === currentTier ? (
                  <>
                    Продление тарифа{" "}
                    <span className={selectedTierData.color}>{selectedTierData.name}</span>
                    {selectedTier === "top_floor_boss" && (
                      <span className="text-white/50">
                        {" "}
                        ({TFB_VARIANTS.find((v) => v.accounts === tfbAccounts)?.label})
                      </span>
                    )}{" "}
                    на 30 дней.
                  </>
                ) : (
                  <>
                    Вы выбрали тариф{" "}
                    <span className={selectedTierData.color}>{selectedTierData.name}</span>
                    {selectedTier === "top_floor_boss" && (
                      <span className="text-white/50">
                        {" "}
                        ({TFB_VARIANTS.find((v) => v.accounts === tfbAccounts)?.label})
                      </span>
                    )}
                    . Подписка будет активирована на 30 дней.
                  </>
                )}
              </p>

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
                  onClick={handleSelectTier}
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
          <Modal isOpen={!!successMessage} onClose={handleSuccess} title="Готово!">
            <div className="space-y-4">
              <div className="flex justify-center">
                <div
                  className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center",
                    "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
                    "border border-accent-green/30"
                  )}
                >
                  <svg
                    className="w-8 h-8 text-accent-green"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-center text-white/80">{successMessage}</p>
              <Button className="w-full" onClick={handleSuccess}>
                Перейти в каталог
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

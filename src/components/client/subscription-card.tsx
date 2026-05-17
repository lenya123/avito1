"use client";

import { cn } from "@/utils/cn";
import { Button } from "@/components/ui";
import type { SubscriptionTier } from "@/types/database";

export interface SubscriptionCardProps {
  tier: SubscriptionTier;
  subscriptionEnd?: string | null;
  isVibePlus: boolean;
  onManage?: () => void;
  className?: string;
}

const TIER_CONFIG: Record<
  SubscriptionTier,
  {
    name: string;
    price: string;
    features: string[];
    color: string;
    gradientColor: string; // RGBA для inline style
    iconBg: string;
  }
> = {
  none: {
    name: "Без подписки",
    price: "0",
    features: [],
    color: "text-white/40",
    gradientColor: "rgba(255,255,255,0.08)",
    iconBg: "from-white/[0.1] to-white/[0.05]",
  },
  basic: {
    name: "Basic",
    price: "500",
    features: ["Доступ к каталогу", "3 заказа в день", "Статистика продаж", "Push-уведомления"],
    color: "text-white",
    gradientColor: "rgba(255,255,255,0.12)",
    iconBg: "from-white/[0.15] to-white/[0.08]",
  },
  premium: {
    name: "Premium",
    price: "5 000",
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
    gradientColor: "rgba(10,132,255,0.15)", // accent-blue с 15% opacity
    iconBg: "from-accent-blue/20 to-accent-blue/10",
  },
  top_floor_boss: {
    name: "Top Floor Boss",
    price: "15 000",
    features: [
      "Всё из Premium",
      "Подключение Avito магазина",
      "AI отвечает покупателям",
      "Статистика заказов по API",
      "Автопубликация объявлений",
      "Генерация фото через AI",
      "Персональные консультации",
    ],
    color: "text-accent-green",
    gradientColor: "rgba(48,209,88,0.15)", // accent-green с 15% opacity
    iconBg: "from-accent-green/20 to-accent-green/10",
  },
};

export function SubscriptionCard({
  tier,
  subscriptionEnd,
  isVibePlus,
  onManage,
  className,
}: SubscriptionCardProps) {
  const config = TIER_CONFIG[tier];

  // Calculate days left
  const daysLeft = subscriptionEnd
    ? Math.max(
        0,
        Math.ceil((new Date(subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : 0;

  const isExpired = daysLeft === 0 && tier !== "none";
  const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;

  return (
    <div
      className={cn(
        "relative p-6 rounded-2xl overflow-hidden",
        "backdrop-blur-xl",
        "border border-glass",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]", // базовый glass-фон
        "shadow-card",
        className
      )}
    >
      {/* Цветной градиент поверх базового фона (вертикальный - отличается от ProfileCard) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${config.gradientColor} 0%, transparent 60%)`,
        }}
      />
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={cn("text-lg font-bold", config.color)}>{config.name}</h3>
            {isVibePlus && (
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-md",
                  "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
                  "border border-glass-subtle",
                  "text-accent-green"
                )}
              >
                +ВАЙБ
              </span>
            )}
          </div>
          <p className="text-sm text-white/60 mt-0.5">
            {tier !== "none" ? `${config.price}₽ / месяц` : "Подписка не активна"}
          </p>
        </div>
        {onManage && tier !== "none" && (
          <Button variant="secondary" size="sm" onClick={onManage}>
            Управлять
          </Button>
        )}
        {onManage && tier === "none" && (
          <Button size="sm" onClick={onManage}>
            Подключить
          </Button>
        )}
      </div>

      {/* Status */}
      {tier !== "none" && (
        <div
          className={cn(
            "mb-4 p-3 rounded-xl",
            "bg-gradient-to-br from-white/[0.08] to-white/[0.03]",
            "border border-glass-subtle"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">
              {isExpired ? "Подписка истекла" : `Осталось ${daysLeft} ${getDaysWord(daysLeft)}`}
            </span>
            {isExpired && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-accent-red/20 text-accent-red">
                Истекла
              </span>
            )}
            {isExpiringSoon && !isExpired && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-accent-orange/20 text-accent-orange">
                Скоро
              </span>
            )}
          </div>
          {subscriptionEnd && (
            <p className="text-xs text-white/40 mt-1">до {formatDate(subscriptionEnd)}</p>
          )}
        </div>
      )}

      {/* Features */}
      {config.features.length > 0 && (
        <div className="space-y-2.5 pt-4 border-t border-glass-subtle">
          {config.features.map((feature, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div
                className={cn(
                  "w-5 h-5 rounded-md flex items-center justify-center",
                  `bg-gradient-to-br ${config.iconBg}`,
                  "border border-glass-subtle"
                )}
              >
                <svg
                  className={cn("w-3 h-3", config.color)}
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
              <span className="text-sm text-white/80">{feature}</span>
            </div>
          ))}
        </div>
      )}

      {/* +ВАЙБ notice */}
      {isVibePlus && (
        <div className="mt-4 pt-4 border-t border-glass-subtle">
          <p className="text-xs text-white/40">
            +ВАЙБ: Premium бесплатно, Top Floor Boss — 10 000₽/мес
          </p>
        </div>
      )}
    </div>
  );
}

// Helpers
function getDaysWord(days: number): string {
  const lastDigit = days % 10;
  const lastTwoDigits = days % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Skeleton
export function SubscriptionCardSkeleton() {
  return (
    <div
      className={cn(
        "relative p-6 rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-6 w-24 bg-white/10 rounded mb-2" />
          <div className="h-4 w-32 bg-white/10 rounded" />
        </div>
        <div className="h-8 w-24 bg-white/10 rounded-lg" />
      </div>
      <div className="mb-4 p-3 rounded-xl bg-white/[0.05] border border-glass-subtle">
        <div className="h-4 w-28 bg-white/10 rounded" />
      </div>
      <div className="space-y-2.5 pt-4 border-t border-glass-subtle">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-5 h-5 bg-white/10 rounded-md" />
            <div className="h-4 w-40 bg-white/10 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

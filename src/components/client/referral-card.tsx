"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { formatPrice } from "@/utils/pricing";

export interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalEarned: number;
}

export interface ReferralCardProps {
  referralCode: string;
  stats: ReferralStats;
  className?: string;
}

export function ReferralCard({ referralCode, stats, className }: ReferralCardProps) {
  const [copied, setCopied] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const shareLink = `https://t.me/avitofamclientsbot?start=${referralCode}`;

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareLink]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Приглашение в Avito Drop",
          text: "Присоединяйся к дропшиппингу на Avito!",
          url: shareLink,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      copyLink();
    }
  }, [shareLink, copyLink]);

  return (
    <div
      className={cn(
        "relative p-6 rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="flex items-center justify-between mb-4 relative">
        <h3 className="text-lg font-bold text-white">Реферальная программа</h3>
        <span
          className={cn(
            "px-2.5 py-1 rounded-xl text-xs font-medium",
            "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
            "text-accent-green",
            "border border-accent-green/30"
          )}
        >
          7% бонус
        </span>
      </div>

      {/* Referral Link */}
      <div
        className={cn(
          "mb-4 p-4 rounded-xl",
          "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
          "border border-glass"
        )}
      >
        <p className="text-xs text-white/40 mb-2">Ваша реферальная ссылка</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white/[0.06] border border-glass-subtle">
            <p className="text-sm text-white/80 truncate font-mono">
              t.me/avitofamclientsbot?start={referralCode}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={copyLink}
            className="shrink-0 min-w-[90px]"
          >
            {copied ? "Скопировано!" : "Копировать"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className={cn(
            "p-3 rounded-xl",
            "bg-gradient-to-br from-white/[0.08] to-white/[0.03]",
            "border border-glass-subtle"
          )}
        >
          <p className="text-2xl font-bold text-white">{stats.totalReferrals}</p>
          <p className="text-xs text-white/40 mt-1">Приглашено</p>
        </div>
        <div
          className={cn(
            "p-3 rounded-xl",
            "bg-gradient-to-br from-accent-green/10 to-accent-green/5",
            "border border-accent-green/20"
          )}
        >
          <p className="text-2xl font-bold text-accent-green">{formatPrice(stats.totalEarned)}</p>
          <p className="text-xs text-white/40 mt-1">Заработано</p>
        </div>
      </div>

      {/* My referrals button */}
      {stats.totalReferrals > 0 && (
        <button
          onClick={() => setModalOpen(true)}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 mb-4 rounded-xl",
            "bg-gradient-to-br from-white/[0.08] to-white/[0.04]",
            "border border-glass-subtle",
            "hover:border-glass hover:from-white/[0.1]",
            "transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl"
          )}
        >
          <span className="text-sm font-medium text-white/80">Мои рефералы</span>
          <svg
            className="w-4 h-4 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* How it works */}
      <div className="pt-4 border-t border-glass-subtle">
        <p className="text-xs text-white/40 mb-3">Как это работает:</p>
        <ul className="space-y-2.5">
          <li className="flex items-start gap-2.5">
            <div
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold",
                "bg-gradient-to-br from-accent-green/25 to-accent-green/15",
                "text-accent-green",
                "border border-accent-green/30"
              )}
            >
              1
            </div>
            <span className="text-xs text-white/60 pt-0.5">Отправьте ссылку другу</span>
          </li>
          <li className="flex items-start gap-2.5">
            <div
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold",
                "bg-gradient-to-br from-accent-green/25 to-accent-green/15",
                "text-accent-green",
                "border border-accent-green/30"
              )}
            >
              2
            </div>
            <span className="text-xs text-white/60 pt-0.5">
              Друг оформляет первый успешный заказ — вы получаете 500₽
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <div
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold",
                "bg-gradient-to-br from-accent-green/25 to-accent-green/15",
                "text-accent-green",
                "border border-accent-green/30"
              )}
            >
              3
            </div>
            <span className="text-xs text-white/60 pt-0.5">
              7% от каждого успешного заказа друга в течение 60 дней (макс 7000₽)
            </span>
          </li>
        </ul>
      </div>

      {/* Share button */}
      <Button className="w-full mt-4" onClick={handleShare}>
        Поделиться
      </Button>

      {/* Referrals Modal */}
      <ReferralsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

// ─── Referrals Modal ───────────────────────────────────────────

interface ReferralItem {
  id: string;
  first_order_bonus: number;
  first_order_bonus_paid: boolean;
  referral_orders_count: number;
  referral_orders_sum: number;
  percent_bonus: number;
  percent_bonus_cap: number;
  bonus_period_ends_at: string | null;
  is_active: boolean;
  created_at: string;
  referral: {
    name: string | null;
    telegram_username: string | null;
  };
}

function ReferralsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError("");

    fetch("/api/referrals")
      .then((res) => {
        if (!res.ok) throw new Error("Ошибка загрузки");
        return res.json();
      })
      .then((data) => setReferrals(data.referrals ?? []))
      .catch(() => setError("Не удалось загрузить данные"))
      .finally(() => setLoading(false));
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Мои рефералы" size="md">
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-glass border-t-white/60 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-sm text-accent-red">{error}</p>
          </div>
        )}

        {!loading && !error && referrals.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-white/40">Пока нет рефералов</p>
          </div>
        )}

        {!loading &&
          !error &&
          referrals.map((item) => <ReferralItemCard key={item.id} item={item} />)}
      </div>
    </Modal>
  );
}

// ─── Referral Item Card ────────────────────────────────────────

function ReferralItemCard({ item }: { item: ReferralItem }) {
  const name =
    item.referral?.name ||
    (item.referral?.telegram_username ? `@${item.referral.telegram_username}` : "Реферал");

  const daysLeft = item.bonus_period_ends_at
    ? Math.max(
        0,
        Math.floor((new Date(item.bonus_period_ends_at).getTime() - Date.now()) / 86400000)
      )
    : 0;

  const isActive = item.is_active && daysLeft > 0;
  const percentProgress =
    item.percent_bonus_cap > 0
      ? Math.min(100, (Number(item.percent_bonus) / Number(item.percent_bonus_cap)) * 100)
      : 0;

  const totalEarned =
    (item.first_order_bonus_paid ? Number(item.first_order_bonus) || 500 : 0) +
    (Number(item.percent_bonus) || 0);

  return (
    <div
      className={cn(
        "p-4 rounded-xl",
        "bg-gradient-to-br from-white/[0.08] to-white/[0.03]",
        "border border-glass-subtle"
      )}
    >
      {/* Header: name + status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white truncate mr-2">{name}</span>
        <span
          className={cn(
            "shrink-0 px-2 py-0.5 rounded-md text-2xs font-medium",
            isActive
              ? "bg-accent-green/15 text-accent-green border border-accent-green/25"
              : "bg-white/[0.06] text-white/40 border border-glass-subtle"
          )}
        >
          {isActive ? `${daysLeft} дн.` : "Завершён"}
        </span>
      </div>

      {/* 500₽ bonus */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/40">Бонус 500₽</span>
        {item.first_order_bonus_paid ? (
          <span className="text-xs font-medium text-accent-green">Получено ✓</span>
        ) : (
          <span className="text-xs text-white/20">Нет успешных заказов</span>
        )}
      </div>

      {/* 7% progress */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/40">7% бонус</span>
          <span className="text-xs font-medium text-white/60">
            {formatPrice(Number(item.percent_bonus) || 0)} /{" "}
            {formatPrice(Number(item.percent_bonus_cap) || 7000)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-green/80 to-accent-green transition-all duration-300"
            style={{ width: `${percentProgress}%` }}
          />
        </div>
      </div>

      {/* Orders count + total earned */}
      <div className="flex items-center justify-between pt-2 border-t border-glass-subtle">
        <span className="text-xs text-white/40">
          {item.referral_orders_count || 0} заказов
          {item.referral_orders_sum ? ` на ${formatPrice(Number(item.referral_orders_sum))}` : ""}
        </span>
        <span className="text-xs font-semibold text-accent-green">+{formatPrice(totalEarned)}</span>
      </div>
    </div>
  );
}

// Skeleton
export function ReferralCardSkeleton() {
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
        <div className="h-6 w-40 bg-white/10 rounded" />
        <div className="h-6 w-20 bg-white/10 rounded-xl" />
      </div>
      <div className="mb-4 p-4 rounded-xl bg-white/[0.05] border border-glass-subtle">
        <div className="h-3 w-24 bg-white/10 rounded mb-2" />
        <div className="flex items-center gap-3">
          <div className="h-8 flex-1 bg-white/10 rounded" />
          <div className="h-8 w-24 bg-white/10 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[1, 2].map((i) => (
          <div key={i} className="p-3 rounded-xl bg-white/[0.05] border border-glass-subtle">
            <div className="h-8 w-12 bg-white/10 rounded mb-2" />
            <div className="h-3 w-20 bg-white/10 rounded" />
          </div>
        ))}
      </div>
      <div className="h-10 w-full bg-white/10 rounded-xl mt-4" />
    </div>
  );
}

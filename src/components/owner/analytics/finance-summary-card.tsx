"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { AnimatedNumber } from "@/components/shared/analytics";

type BadgeKind = "result" | "memo" | "accrued";

/** Мини-метка связи числа с Чистой прибылью (синхронно с slim-сводкой
 *  на странице Финансы). Все бэджи используют один нейтральный фон —
 *  отличие только в цветной точке и тексте, чтобы визуально читались
 *  одинаково (а не выпирали цветные где попало). */
function RelationBadge({ kind }: { kind: BadgeKind }) {
  const map: Record<BadgeKind, { text: string; dot: string }> = {
    result: { text: "итог", dot: "bg-white/55" },
    memo: { text: "памятка · не в прибыли", dot: "bg-white/35" },
    accrued: { text: "в прибыли · ждём поступления", dot: "bg-accent-blue" },
  };
  const r = map[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5",
        "rounded-md border text-2xs leading-none",
        "text-white/65 bg-white/[0.06] border-white/15"
      )}
    >
      <span className={cn("w-1 h-1 rounded-full", r.dot)} />
      {r.text}
    </span>
  );
}

interface FinanceSummaryCardProps {
  netProfit: number;
  totalExpenses: number;
  expensesCount: number;
  totalPayouts: number;
  payoutsCount: number;
  treasury: {
    customerBalanceOwed: number;
    vibeDebtTotal: number;
    partnerDebtOwed: number;
  };
}

/**
 * Карточка-мост «Финансы» на странице Аналитика — два hero-числа
 * (Чистая прибыль за период + Касса/обязательства) + утилитарная строка
 * с Расходами и Выплатами. Вся карточка кликабельна → /owner/finance,
 * где живут журналы операций и подробная Касса (Apple-стиль summary →
 * drill-down, как Wallet/Health-карточки). Цифры — те же канон-формулы
 * §9.4/§9.8/§10.4 что и на странице Финансы.
 */
export function FinanceSummaryCard({
  netProfit,
  totalExpenses,
  expensesCount,
  totalPayouts,
  payoutsCount,
  treasury,
}: FinanceSummaryCardProps) {
  const isLoss = netProfit < 0;
  // Касса состоит из ДВУХ ПРОТИВОПОЛОЖНЫХ направлений — показываем
  // отдельными карточками, чтобы не сваливать в одну сумму:
  //  - customerBalanceOwed: владелец → клиентам (деньги на балансах
  //    клиентов, физически на картах владельца, держать нетронутыми).
  //  - vibeDebtTotal + partnerDebtOwed: клиенты/партнёры → владельцу
  //    (ожидаемые поступления — заказы в долг + комиссии с sent).
  const dueToOwner = treasury.vibeDebtTotal + treasury.partnerDebtOwed;

  return (
    <Link href="/owner/finance" className="block group" aria-label="Открыть Финансы">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card",
          "transition-colors duration-200",
          "group-hover:border-white/20"
        )}
      >
        {/* Декоративный блик */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">💼</span>
            <h3 className="text-sm font-semibold text-white">Финансы</h3>
          </div>
          <div className="flex items-center gap-1 text-xs text-white/40 group-hover:text-white/70 transition-colors">
            <span>Подробности и журналы</span>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* 3 hero-числа — Прибыль / Балансы клиентов / Должны тебе.
            Касса разнесена на ДВА направления (балансы клиентов —
            пассивная сумма на их счетах vs клиенты/партнёры → владельцу),
            чтобы не путать «долг клиентам» с «балансом» (запроса на
            выплату нет — баланс просто лежит). */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pb-3">
          {/* Чистая прибыль */}
          <div
            className={cn(
              "p-3 rounded-xl bg-gradient-to-b",
              isLoss
                ? "from-accent-red/[0.12] to-accent-red/[0.04] border border-accent-red/20"
                : "from-accent-green/[0.10] to-accent-green/[0.03] border border-accent-green/20"
            )}
          >
            <p className="text-2xs uppercase tracking-wider text-white/45 mb-1">
              Чистая прибыль за период
            </p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                isLoss ? "text-accent-red" : "text-accent-green"
              )}
            >
              <AnimatedNumber value={netProfit} format={(v) => formatPrice(v)} />
            </p>
            <p className="text-2xs text-white/35 mt-1">после расходов и выплат</p>
            <RelationBadge kind="result" />
          </div>

          {/* Балансы клиентов — пассивная сумма на их счетах. */}
          <div
            className={cn(
              "p-3 rounded-xl",
              "bg-gradient-to-b from-accent-orange/[0.10] to-accent-orange/[0.03]",
              "border border-accent-orange/20"
            )}
          >
            <p className="text-2xs uppercase tracking-wider text-white/45 mb-1">Балансы клиентов</p>
            <p className="text-2xl font-bold text-accent-orange tabular-nums">
              <AnimatedNumber value={treasury.customerBalanceOwed} format={(v) => formatPrice(v)} />
            </p>
            <p className="text-2xs text-white/35 mt-1">на твоих картах — держать нетронутыми</p>
            <RelationBadge kind="memo" />
          </div>

          {/* Должны тебе (клиенты/партнёры → владельцу) */}
          <div
            className={cn(
              "p-3 rounded-xl",
              "bg-gradient-to-b from-accent-blue/[0.10] to-accent-blue/[0.03]",
              "border border-accent-blue/20"
            )}
          >
            <p className="text-2xs uppercase tracking-wider text-white/45 mb-1">Должны тебе</p>
            <p className="text-2xl font-bold text-accent-blue tabular-nums">
              <AnimatedNumber value={dueToOwner} format={(v) => formatPrice(v)} />
            </p>
            <p className="text-2xs text-white/35 mt-1">
              +ВАЙБ {formatPrice(treasury.vibeDebtTotal)} · партнёры{" "}
              {formatPrice(treasury.partnerDebtOwed)}
            </p>
            <RelationBadge kind="accrued" />
          </div>
        </div>

        {/* Утилитарная строка: расходы / выплаты */}
        <div className="px-4 pb-4 pt-1">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/55">
            <span>
              <span className="text-white/35">Расходы:</span>{" "}
              <span className="font-medium text-white/80">{formatPrice(totalExpenses)}</span>{" "}
              <span className="text-white/30">({expensesCount})</span>
            </span>
            <span className="text-white/15">·</span>
            <span>
              <span className="text-white/35">Выплаты:</span>{" "}
              <span className="font-medium text-white/80">{formatPrice(totalPayouts)}</span>{" "}
              <span className="text-white/30">({payoutsCount})</span>
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

export function FinanceSummaryCardSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="h-4 w-24 bg-white/10 rounded" />
        <div className="h-4 w-32 bg-white/10 rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pb-3">
        <div className="h-20 rounded-xl bg-white/5" />
        <div className="h-20 rounded-xl bg-white/5" />
        <div className="h-20 rounded-xl bg-white/5" />
      </div>
      <div className="px-4 pb-4 pt-1">
        <div className="h-3 w-3/4 bg-white/10 rounded" />
      </div>
    </div>
  );
}

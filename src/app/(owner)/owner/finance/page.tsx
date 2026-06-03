"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerFinance } from "@/hooks/use-owner-finance";
import type { FinanceFilters } from "@/hooks/use-owner-finance";
import { ErrorState, DatePicker } from "@/components/ui";
import {
  FinanceTabs,
  ExpensesTab,
  PayoutsTab,
  DebtsTab,
  AddExpenseModal,
  AddPayoutModal,
} from "@/components/owner/finance";
import type { FinanceTab } from "@/components/owner/finance";
import { formatPrice } from "@/utils/pricing";
import { cn } from "@/utils/cn";
import { displayToIso } from "@/utils/date-format";
import { ChannelToggle, type Channel } from "@/components/owner/analytics/channel-toggle";
import { ChannelsCard } from "@/components/owner/analytics/channels-card";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 дней" },
  { value: 30, label: "30 дней" },
  { value: 90, label: "90 дней" },
];

/**
 * Страница «Финансы» — операционная: журналы Расходов / Выплат / Касса
 * (обязательства владельца §9.8 + §10.4). KPI/донат/тренд/Товары теперь
 * на Аналитике (карточка-мост ведёт сюда же). Минимум дублирования.
 */
export default function OwnerFinancePage() {
  const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
  const [days, setDays] = useState(30);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState<FinanceTab>("expenses");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [channel, setChannel] = useState<Channel>("all");

  const filters = useMemo<FinanceFilters>(() => {
    const base: FinanceFilters =
      periodMode === "custom" && dateFrom
        ? {
            dateFrom: displayToIso(dateFrom),
            dateTo: dateTo ? displayToIso(dateTo) : undefined,
          }
        : { days };
    if (channel !== "all") base.channel = channel;
    return base;
  }, [periodMode, days, dateFrom, dateTo, channel]);

  const { data, isLoading, error, refetch } = useOwnerFinance(filters);

  const selectPreset = (value: number) => {
    setPeriodMode("preset");
    setDays(value);
    setDateFrom("");
    setDateTo("");
  };

  if (error && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить финансовые данные"
          onRetry={refetch}
        />
      </div>
    );
  }

  const netProfit = data ? data.summary.netProfit : 0;
  const customerBalances = data ? data.treasury.customerBalanceOwed : 0;
  const dueToOwner = data ? data.treasury.vibeDebtTotal + data.treasury.partnerDebtOwed : 0;
  const cashInflow = data ? data.summary.cashInflow : 0;
  const totalExp = data ? data.summary.totalExpenses : 0;
  const totalPay = data ? data.summary.totalPayouts : 0;
  const expCount = data ? data.expenses.length : 0;
  const payCount = data ? data.payouts.length : 0;
  const isLoss = netProfit < 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Финансы</h1>
            <p className="text-white/60 mt-1">Журналы операций и Касса</p>
            <Link
              href="/owner/analytics"
              className="inline-flex items-center gap-1 mt-2 text-xs text-white/45 hover:text-white transition-colors"
            >
              <span>↗ Сводка, KPI и графики — на Аналитике</span>
            </Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => selectPreset(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-sm transition-all duration-200",
                  periodMode === "preset" && days === opt.value
                    ? "bg-white/[0.12] text-white border border-glass-active shadow-glass-inset"
                    : "text-white/60 hover:text-white hover:bg-white/[0.06]"
                )}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setPeriodMode(periodMode === "custom" ? "preset" : "custom")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-sm transition-all duration-200",
                periodMode === "custom"
                  ? "bg-white/[0.12] text-white border border-glass-active shadow-glass-inset"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              )}
            >
              Свой период
            </button>
            {/* §7.1 + §15: канал сбыта (фильтрует KPI, графики, журналы). */}
            <ChannelToggle value={channel} onChange={setChannel} />
          </div>
        </div>

        {periodMode === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3"
          >
            <div className="flex-1 max-w-[160px]">
              <DatePicker
                label="От"
                value={dateFrom}
                onChange={(v) => {
                  setPeriodMode("custom");
                  setDateFrom(v);
                }}
                placeholder="дд.мм.гг"
              />
            </div>
            <div className="flex-1 max-w-[160px]">
              <DatePicker
                label="До"
                value={dateTo}
                onChange={(v) => {
                  setPeriodMode("custom");
                  setDateTo(v);
                }}
                placeholder="дд.мм.гг"
              />
            </div>
            <button
              onClick={() => selectPreset(30)}
              className="text-xs text-white/40 hover:text-white transition-colors mt-5"
            >
              Сбросить
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* Slim summary — 6 цифр. Под каждой нейтральная пилюля с цветной
          точкой: связь с Чистой прибылью (итог / минус / памятка / уже
          в прибыли / реальный кэш). */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-6 gap-3"
      >
        <SummaryCell
          label="Пришло на карту"
          value={isLoading || !data ? null : formatPrice(cashInflow)}
          sub={
            data
              ? `заказы ${formatPrice(data.summary.cashInflowBreakdown.orders)} · +ВАЙБ ${formatPrice(data.summary.cashInflowBreakdown.vibe)} · комиссии ${formatPrice(data.summary.cashInflowBreakdown.partner)}`
              : ""
          }
          tone="green"
          relation="cash"
        />
        <SummaryCell
          label="Чистая прибыль"
          value={isLoading || !data ? null : formatPrice(netProfit)}
          sub="после расходов и выплат"
          tone={isLoss ? "red" : "green"}
          relation="result"
        />
        <SummaryCell
          label="Расходы"
          value={isLoading || !data ? null : formatPrice(totalExp)}
          sub={data ? `${expCount} ${plural(expCount, "запись", "записи", "записей")}` : ""}
          tone="neutral"
          relation="minus"
        />
        <SummaryCell
          label="Выплаты"
          value={isLoading || !data ? null : formatPrice(totalPay)}
          sub={data ? `${payCount} ${plural(payCount, "выплата", "выплаты", "выплат")}` : ""}
          tone="neutral"
          relation="minus"
        />
        <SummaryCell
          label="Балансы клиентов"
          value={isLoading || !data ? null : formatPrice(customerBalances)}
          sub="на твоих картах · детали в Кассе"
          tone="orange"
          relation="memo"
        />
        <SummaryCell
          label="Должны тебе"
          value={isLoading || !data ? null : formatPrice(dueToOwner)}
          sub={
            data
              ? `+ВАЙБ ${formatPrice(data.treasury.vibeDebtTotal)} · партнёры ${formatPrice(data.treasury.partnerDebtOwed)}`
              : ""
          }
          tone="blue"
          relation="accrued"
        />
      </motion.div>

      {/* ТЗ §7.2: «Каналы сбыта» — карточка сравнения Дроп vs Авито,
          фильтр канала на неё не действует. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <ChannelsCard
          period={filters.dateFrom ? "custom" : days <= 7 ? "week" : days <= 90 ? "month" : "quarter"}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
        />
      </motion.div>

      {/* Tabs: Расходы / Выплаты / Касса */}
      {data && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <FinanceTabs active={activeTab} onChange={setActiveTab} />
          </motion.div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "expenses" && (
              <ExpensesTab
                expenses={data.expenses}
                categories={data.expenseCategories}
                totalExpenses={data.summary.totalExpenses}
                onAddExpense={() => setShowExpenseModal(true)}
              />
            )}
            {activeTab === "payouts" && (
              <PayoutsTab
                payouts={data.payouts}
                totalPayouts={data.summary.totalPayouts}
                onAddPayout={() => setShowPayoutModal(true)}
              />
            )}
            {activeTab === "debts" && (
              <DebtsTab
                debts={data.debts}
                totalDebt={data.summary.totalDebt}
                treasury={data.treasury}
              />
            )}
          </motion.div>
        </>
      )}

      {/* Modals */}
      {showExpenseModal && data && (
        <AddExpenseModal
          onClose={() => setShowExpenseModal(false)}
          categories={data.expenseCategories}
        />
      )}
      {showPayoutModal && <AddPayoutModal onClose={() => setShowPayoutModal(false)} />}
    </div>
  );
}

/** Russian pluralization: 1 / 2-4 / 5+ (с учётом 11-14 как «много»). */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Компактная ячейка slim-сводки с relation-меткой её связи с прибылью.
 *  Все бэджики используют один нейтральный фон — отличие только в
 *  цветной точке и тексте (чтобы визуально читались одинаково). */
type CellRelation = "cash" | "result" | "minus" | "memo" | "accrued";

function RelationBadge({ relation }: { relation: CellRelation }) {
  const map: Record<CellRelation, { text: string; dot: string }> = {
    cash: { text: "реальный кэш", dot: "bg-accent-green" },
    result: { text: "итог", dot: "bg-white/55" },
    minus: { text: "− из прибыли", dot: "bg-accent-red" },
    memo: { text: "памятка · не в прибыли", dot: "bg-white/35" },
    accrued: { text: "в прибыли · ждём поступления", dot: "bg-accent-blue" },
  };
  const r = map[relation];
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

function SummaryCell({
  label,
  value,
  sub,
  tone,
  relation,
}: {
  label: string;
  value: string | null;
  sub: string;
  tone: "green" | "red" | "orange" | "blue" | "neutral";
  relation?: CellRelation;
}) {
  const accentText =
    tone === "green"
      ? "text-accent-green"
      : tone === "red"
        ? "text-accent-red"
        : tone === "orange"
          ? "text-accent-orange"
          : tone === "blue"
            ? "text-accent-blue"
            : "text-white";
  const border =
    tone === "green"
      ? "border-accent-green/15"
      : tone === "red"
        ? "border-accent-red/15"
        : tone === "orange"
          ? "border-accent-orange/15"
          : tone === "blue"
            ? "border-accent-blue/15"
            : "border-glass";
  return (
    <div
      className={cn(
        "p-3 rounded-2xl",
        "bg-gradient-to-b from-white/[0.06] to-white/[0.03]",
        "border shadow-card",
        border
      )}
    >
      <p className="text-2xs uppercase tracking-wider text-white/40">{label}</p>
      {value === null ? (
        <div className="h-7 w-24 bg-white/10 rounded mt-1 animate-pulse" />
      ) : (
        <p className={cn("text-xl font-bold mt-1 tabular-nums", accentText)}>{value}</p>
      )}
      {sub && <p className="text-2xs text-white/35 mt-1">{sub}</p>}
      {relation && <RelationBadge relation={relation} />}
    </div>
  );
}

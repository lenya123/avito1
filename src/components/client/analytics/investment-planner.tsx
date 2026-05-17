"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { Toggle } from "@/components/ui";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

// ─── Types ──────────────────────────────────────────────────────────────────

type Horizon = 1 | 3 | 6;

interface InvestmentPlannerProps {
  avgOrderPrice: number;
  avgProfitPerOrder: number;
  avgCycleDays: number;
  products: AnalyticsResponse["products"];
  ordersPerDay: number;
  completedOrders: number;
  conversionRate: number;
  className?: string;
}

// ─── Russian word forms ─────────────────────────────────────────────────────

function getOrdersWord(n: number): string {
  const r = Math.round(n);
  const d = r % 10;
  const dd = r % 100;
  if (dd >= 11 && dd <= 19) return "заказов";
  if (d === 1) return "заказ";
  if (d >= 2 && d <= 4) return "заказа";
  return "заказов";
}

function getMonthWord(n: number): string {
  if (n === 1) return "месяц";
  if (n >= 2 && n <= 4) return "месяца";
  return "месяцев";
}

function getCycleWord(n: number): string {
  const r = Math.round(n);
  const d = r % 10;
  const dd = r % 100;
  if (dd >= 11 && dd <= 19) return "оборотов";
  if (d === 1) return "оборот";
  if (d >= 2 && d <= 4) return "оборота";
  return "оборотов";
}

// ─── Projection calculations ────────────────────────────────────────────────

interface ProjectionResult {
  totalNetProfit: number;
  totalGrossProfit: number;
  totalReturnLoss: number;
  totalOrders: number;
  cycles: number;
  cumulativeProfit: number[];
  capacityLimited: boolean;
  maxEffectiveInvestment: number;
  requiredOrdersPerDay: number;
}

function projectGrowth(
  initial: number,
  avgPrice: number,
  avgProfit: number,
  cycleDays: number,
  horizonMonths: number,
  reinvest: boolean,
  profitMul: number = 1,
  cycleMul: number = 1,
  ordersPerDay: number = 0,
  conversionRate: number = 100,
  completedOrders: number = 0
): ProjectionResult {
  // ── Reality adjustments ──

  // 1. Confidence: на базе общего кол-ва завершённых заказов
  let confidenceCoef = 1.0;
  if (completedOrders < 5) confidenceCoef = 0.65;
  else if (completedOrders < 20) confidenceCoef = 0.8;
  else if (completedOrders < 50) confidenceCoef = 0.92;

  // 2. Cycle overhead: зазор между циклами (выбор товара, оформление)
  //    avgCycleDays уже включает полный цикл created→completed
  const cycleOverheadDays = cycleDays * 0.07;

  const effectiveCycle = Math.max(1, cycleDays * cycleMul + cycleOverheadDays);
  const totalDays = horizonMonths * 30;
  const cycles = Math.max(1, Math.round(totalDays / effectiveCycle));

  // Операционная ёмкость на базе реального темпа
  const maxOrdersPerCycle = ordersPerDay > 0 ? ordersPerDay * effectiveCycle : Infinity;

  // conversionRate = completed / (completed + returned + cancelled) — единственный множитель
  const conversionMultiplier = conversionRate / 100;
  const effectiveProfit = avgProfit * profitMul * confidenceCoef;
  const rawProfit = avgProfit * profitMul; // без confidence — для gross

  let capital = initial;
  let totalNet = 0;
  let totalGross = 0;
  let totalCompleted = 0;
  const cumulative: number[] = [];

  const maxEffectiveInvestment = ordersPerDay > 0 ? Math.round(maxOrdersPerCycle * avgPrice) : 0;
  // Only flag when INITIAL investment exceeds capacity (not from reinvest growth)
  const capacityLimited = maxEffectiveInvestment > 0 && initial > maxEffectiveInvestment;

  for (let i = 0; i < cycles; i++) {
    const capitalBasedOrders = avgPrice > 0 ? capital / avgPrice : 0;
    const createdOrders = Math.min(capitalBasedOrders, maxOrdersPerCycle);

    if (createdOrders < 0.1) break;

    const completed = createdOrders * conversionMultiplier;
    const net = completed * effectiveProfit;
    const gross = createdOrders * rawProfit;

    totalGross += gross;
    totalNet += net;
    totalCompleted += completed;
    cumulative.push(totalNet);

    if (reinvest) {
      capital = capital + net;
    }
  }

  // Темп заказов/день, необходимый для полного использования вложения
  const requiredOrdersPerDay =
    avgPrice > 0 && effectiveCycle > 0 ? initial / avgPrice / effectiveCycle : 0;

  return {
    totalNetProfit: totalNet,
    totalGrossProfit: totalGross,
    totalReturnLoss: totalGross - totalNet,
    totalOrders: totalCompleted,
    cycles,
    cumulativeProfit: cumulative,
    capacityLimited,
    maxEffectiveInvestment,
    requiredOrdersPerDay,
  };
}

// ─── Product mix allocation ─────────────────────────────────────────────────

interface MixItem {
  name: string;
  photoUrl: string | null;
  allocationPct: number;
  amount: number;
  expectedProfit: number;
  roi: number;
}

function calculateProductMix(
  products: AnalyticsResponse["products"],
  budget: number,
  conversionRate: number = 100
): MixItem[] {
  // Show only top 3
  const candidates = products.filter((p) => p.roi > 0 && p.ordersCount >= 1).slice(0, 3);

  if (candidates.length === 0) return [];

  const scored = candidates.map((p) => ({
    ...p,
    score: p.roi * (1 - p.returnRate / 100) * Math.min(1, p.ordersCount / 5),
  }));

  const totalScore = scored.reduce((s, p) => s + p.score, 0);
  if (totalScore <= 0) return [];

  return scored.map((p) => {
    const pct = p.score / totalScore;
    const amount = Math.round(budget * pct);
    const avgPrice = p.ordersCount > 0 ? p.totalInvested / p.ordersCount : 0;
    const createdOrders = avgPrice > 0 ? amount / avgPrice : 0;

    const completedOrders = createdOrders * (conversionRate / 100);
    const profit = completedOrders * p.avgProfitPerOrder;

    return {
      name: p.name,
      photoUrl: p.photoUrl,
      allocationPct: Math.round(pct * 100),
      amount,
      expectedProfit: Math.round(profit),
      roi: p.roi,
    };
  });
}

// ─── Confidence ─────────────────────────────────────────────────────────────

function getConfidence(completed: number) {
  if (completed >= 50)
    return {
      label: "Прогноз надёжный",
      suffix: "заказов в базе",
      color: "text-accent-green",
      tooltip: "Большая выборка. Прогноз максимально точен.",
    };
  if (completed >= 20)
    return {
      label: "Прогноз точный",
      suffix: "заказов в базе",
      color: "text-accent-blue",
      tooltip: "Средняя выборка. Корректировка -8% на погрешность данных.",
    };
  if (completed >= 5)
    return {
      label: "Прогноз условный",
      suffix: "заказов",
      color: "text-accent-orange",
      tooltip: "Малая выборка. Корректировка -20% на недостаток данных.",
    };
  return {
    label: "Прогноз ориентировочный",
    suffix: "заказов — мало данных",
    color: "text-accent-orange",
    tooltip: "Очень мало завершённых заказов. Корректировка -35%.",
  };
}

// ─── Chart sampling ─────────────────────────────────────────────────────────

function sampleArray(arr: number[], max: number): number[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INVEST_PRESETS = [5000, 10000, 50000, 100000];
const HORIZONS: Horizon[] = [1, 3, 6];

// ─── Component ──────────────────────────────────────────────────────────────

export function InvestmentPlanner({
  avgOrderPrice,
  avgProfitPerOrder,
  avgCycleDays,
  products,
  ordersPerDay,
  completedOrders,
  conversionRate,
  className,
}: InvestmentPlannerProps) {
  const [investAmount, setInvestAmount] = useState(10000);
  const [horizon, setHorizon] = useState<Horizon>(1);
  const [reinvest, setReinvest] = useState(true);
  const [showConfidenceTooltip, setShowConfidenceTooltip] = useState(false);
  const [showReinvestTooltip, setShowReinvestTooltip] = useState(false);
  const confidenceRef = useRef<HTMLDivElement>(null);
  const reinvestTooltipRef = useRef<HTMLDivElement>(null);

  const confidence = getConfidence(completedOrders);

  // Close confidence tooltip on outside click
  useEffect(() => {
    if (!showConfidenceTooltip) return;
    const handler = (e: MouseEvent) => {
      if (confidenceRef.current && !confidenceRef.current.contains(e.target as Node)) {
        setShowConfidenceTooltip(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showConfidenceTooltip]);

  // Close reinvest tooltip on outside click
  useEffect(() => {
    if (!showReinvestTooltip) return;
    const handler = (e: MouseEvent) => {
      if (reinvestTooltipRef.current && !reinvestTooltipRef.current.contains(e.target as Node)) {
        setShowReinvestTooltip(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showReinvestTooltip]);

  const investData = useMemo(() => {
    const realist = projectGrowth(
      investAmount,
      avgOrderPrice,
      avgProfitPerOrder,
      avgCycleDays,
      horizon,
      reinvest,
      1,
      1,
      ordersPerDay,
      conversionRate,
      completedOrders
    );

    // Когда ёмкость ограничена — считаем потенциал без лимита темпа.
    // reinvest=false: клиент не может обработать даже начальный капитал,
    // поэтому compound growth физически невозможен — показываем линейный потенциал.
    let potential: ProjectionResult | null = null;
    if (realist.capacityLimited) {
      potential = projectGrowth(
        investAmount,
        avgOrderPrice,
        avgProfitPerOrder,
        avgCycleDays,
        horizon,
        false, // линейный потенциал — без реинвеста
        1,
        1,
        0, // без лимита ёмкости
        conversionRate,
        completedOrders
      );
    }

    return { realist, potential };
  }, [
    investAmount,
    avgOrderPrice,
    avgProfitPerOrder,
    avgCycleDays,
    horizon,
    reinvest,
    ordersPerDay,
    conversionRate,
    completedOrders,
  ]);

  const productMix = useMemo(() => {
    return calculateProductMix(products, investAmount, conversionRate);
  }, [products, investAmount, conversionRate]);

  const cycleDaysRound = Math.round(avgCycleDays) || 14;

  // Показываем потенциал (uncapped), если ёмкость ограничена; иначе — реалист
  const displayData = investData.potential || investData.realist;

  // Early return AFTER all hooks (React rules of hooks)
  if (avgOrderPrice <= 0) return null;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-6">
        {/* Title */}
        <h3 className="text-lg font-semibold text-white mb-1">Планировщик</h3>
        <p className="text-xs text-white/40 mb-4">
          Реалистичный прогноз на основе твоей статистики
        </p>

        {/* ═══ Amount input ═══ */}
        <div className="flex flex-wrap gap-2 mb-3">
          {INVEST_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setInvestAmount(p)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap",
                "backdrop-blur-xl border transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                investAmount === p
                  ? [
                      "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                      "text-white border-glass-strong",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_rgba(94,92,230,0.15),inset_0_1px_0_rgba(255,255,255,0.2)]",
                    ]
                  : [
                      "bg-white/[0.06] text-white/60 border-glass-subtle",
                      "shadow-glass-inset",
                      "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                    ]
              )}
            >
              {formatPrice(p)}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/40">Сумма вложения</span>
            <span className="text-sm font-medium text-white">{formatPrice(investAmount)}</span>
          </div>
          <input
            type="range"
            min={1000}
            max={300000}
            step={1000}
            value={investAmount}
            onChange={(e) => setInvestAmount(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-white/[0.08] accent-accent-blue cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(10,132,255,0.5)]"
          />
        </div>

        {/* ═══ Horizon + Reinvest ═══ */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-xl transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                  horizon === h
                    ? "bg-white/[0.15] text-white border border-glass"
                    : "text-white/40 hover:text-white/60"
                )}
              >
                {h} {getMonthWord(h)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 relative" ref={reinvestTooltipRef}>
            <span className="text-xs text-white/40">Реинвест</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowReinvestTooltip(!showReinvestTooltip);
              }}
              aria-label="Подробнее"
              className={cn(
                "relative w-4 h-4 rounded-full flex items-center justify-center",
                "after:absolute after:inset-[-14px] after:content-['']",
                "text-2xs font-semibold leading-none transition-all",
                "backdrop-blur-sm border",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-full",
                showReinvestTooltip
                  ? [
                      "bg-gradient-to-b from-white/[0.20] to-white/[0.10]",
                      "border-glass-active text-white/80",
                      "shadow-card",
                    ]
                  : [
                      "bg-gradient-to-b from-white/[0.10] to-white/[0.05]",
                      "border-glass-subtle text-white/40",
                      "shadow-glass-inset",
                      "hover:from-white/[0.15] hover:to-white/[0.08] hover:border-white/20 hover:text-white/60",
                    ]
              )}
            >
              i
            </button>
            <AnimatePresence>
              {showReinvestTooltip && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "absolute bottom-full right-0 mb-2 z-50",
                    "px-3 py-2.5 rounded-xl w-56",
                    "bg-gradient-to-b from-secondary/95 via-secondary/95 to-secondary/95",
                    "backdrop-blur-2xl border border-glass",
                    "shadow-card-hover"
                  )}
                >
                  <p className="text-xs text-white/80 leading-relaxed font-medium">
                    Вкладывать прибыль обратно в новые заказы для роста по экспоненте.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            <Toggle size="sm" checked={reinvest} onChange={setReinvest} />
          </div>
        </div>

        {/* ═══════════════════════ RESULTS ═══════════════════════ */}
        {investData && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`i-${investAmount}-${horizon}-${reinvest}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {/* ── Hero Result ── */}
              <div
                className={cn(
                  "rounded-2xl px-5 pt-4 pb-3 mb-4",
                  "bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
                  "border border-glass-subtle"
                )}
              >
                <p className="text-sm text-white/40 text-center mb-2">
                  Ожидаемая прибыль за {horizon} {getMonthWord(horizon)}
                </p>

                {/* Main result — BIG */}
                <div className="text-center mb-1">
                  <motion.p
                    key={displayData.totalNetProfit}
                    initial={{ scale: 0.95, opacity: 0.8 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="text-4xl font-bold text-accent-green mb-1"
                  >
                    {formatPrice(Math.round(displayData.totalNetProfit))}
                  </motion.p>
                  <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                    <span>
                      ~{Math.round(displayData.totalOrders)}{" "}
                      {getOrdersWord(Math.round(displayData.totalOrders))}
                    </span>
                    <span>·</span>
                    <span>
                      {displayData.cycles} {getCycleWord(displayData.cycles)}
                    </span>
                    <span>·</span>
                    <span>
                      ROI{" "}
                      {investAmount > 0
                        ? Math.round((displayData.totalNetProfit / investAmount) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                </div>

                {/* Capacity ceiling hint */}
                {investData.realist.capacityLimited &&
                  investData.realist.maxEffectiveInvestment > 0 && (
                    <div className="mt-3 p-2.5 rounded-xl bg-accent-orange/[0.08] border border-accent-orange/20">
                      <p className="text-xs text-accent-orange/80 leading-relaxed">
                        При текущем темпе ({ordersPerDay.toFixed(1)} заказов/день) прибыль составит{" "}
                        {formatPrice(Math.round(investData.realist.totalNetProfit))}. Увеличь темп
                        до {investData.realist.requiredOrdersPerDay.toFixed(1)} заказов/день, чтобы
                        задействовать всю сумму вложения.
                      </p>
                    </div>
                  )}

                {/* Details — collapsible */}
                {conversionRate < 100 && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-white/40 hover:text-white/60 transition-colors list-none flex items-center justify-center gap-1.5 min-h-[44px]">
                      <span>Подробный расчёт</span>
                      <svg
                        className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </summary>
                    <div className="mt-3 pt-3 border-t border-glass-subtle space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Если все завершатся</span>
                        <span className="font-medium text-white/60">
                          +{formatPrice(Math.round(displayData.totalGrossProfit))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">
                          Возвраты/отмены ({Math.round(100 - conversionRate)}%)
                        </span>
                        <span className="font-medium text-accent-red/80">
                          −{formatPrice(Math.round(displayData.totalReturnLoss))}
                        </span>
                      </div>
                    </div>
                  </details>
                )}
              </div>

              {/* ── Compound growth chart ── */}
              <div className="mb-4">
                <GrowthChart data={displayData.cumulativeProfit} cycleDays={cycleDaysRound} />
                {horizon > 1 && (
                  <p className="text-2xs text-white/20 text-center mt-2">
                    * При сохранении текущих показателей
                  </p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* ═══ Product mix ═══ */}
        {productMix.length > 0 && (
          <div className="border-t border-glass-subtle pt-5 mb-4">
            <p className="text-sm font-medium text-white/60 mb-1">Топ товары для вложения</p>
            <p className="text-xs text-white/20 mb-3">Прибыль за первый оборот</p>
            <div className="space-y-3">
              {productMix.map((p, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt={p.name}
                      className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-md"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-white/[0.08] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white font-medium truncate">{p.name}</span>
                      <span className="text-xs text-accent-green font-semibold shrink-0 ml-2">
                        +{formatPrice(p.expectedProfit)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-white/[0.15] border border-glass-minimal overflow-hidden">
                        <div
                          className="h-full bg-accent-blue rounded-r-full border-r-2 border-accent-blue/30"
                          style={{ width: `${p.allocationPct}%` }}
                        />
                      </div>
                      <span className="text-2xs text-white/40 shrink-0 font-medium">
                        {p.allocationPct}%
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Confidence ═══ */}
        <div
          className={cn(
            "p-3 rounded-xl",
            "bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
            "border border-glass-subtle"
          )}
          ref={confidenceRef}
        >
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium", confidence.color)}>
                {confidence.label}
              </span>
              <span className="text-white/20">•</span>
              <span className="text-xs text-white/60">
                {completedOrders} {confidence.suffix}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfidenceTooltip(!showConfidenceTooltip);
                }}
                aria-label="Подробнее"
                className={cn(
                  "relative w-4 h-4 rounded-full flex items-center justify-center ml-auto",
                  "after:absolute after:inset-[-14px] after:content-['']",
                  "text-2xs font-semibold leading-none transition-all",
                  "backdrop-blur-sm border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-full",
                  showConfidenceTooltip
                    ? [
                        "bg-gradient-to-b from-white/[0.20] to-white/[0.10]",
                        "border-glass-active text-white/80",
                        "shadow-card",
                      ]
                    : [
                        "bg-gradient-to-b from-white/[0.10] to-white/[0.05]",
                        "border-glass-subtle text-white/40",
                        "shadow-glass-inset",
                        "hover:from-white/[0.15] hover:to-white/[0.08] hover:border-white/20 hover:text-white/60",
                      ]
                )}
              >
                i
              </button>
            </div>
            <AnimatePresence>
              {showConfidenceTooltip && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <p className="text-xs text-white/60 leading-relaxed mt-2">{confidence.tooltip}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface GrowthChartProps {
  data: number[];
  cycleDays: number;
}

function GrowthChart({ data, cycleDays }: GrowthChartProps) {
  const sampled = sampleArray(data, 6);
  const max = Math.max(...sampled, 1);
  const [chartHeight, setChartHeight] = useState(160);

  useEffect(() => {
    const update = () => setChartHeight(window.innerWidth >= 768 ? 200 : 160);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Calculate which cycle each bar represents
  const getCycleInfo = (barIndex: number) => {
    if (data.length <= 6) {
      // No sampling - each bar = 1 cycle
      const cycleNum = barIndex + 1;
      const timeMonths = (cycleNum * cycleDays) / 30;
      return { cycleNum, timeMonths, isRange: false };
    } else {
      // Sampled - each bar represents multiple cycles
      const step = (data.length - 1) / (sampled.length - 1);
      const cycleIndex = Math.round(barIndex * step);
      const cycleNum = cycleIndex + 1;
      const timeMonths = (cycleNum * cycleDays) / 30;
      return { cycleNum, timeMonths, isRange: true };
    }
  };

  const formatTime = (months: number): string => {
    if (months < 0.5) {
      const weeks = Math.round((months * 30) / 7);
      return `~${weeks}н`;
    } else if (months < 1.5) {
      return "~1м";
    } else {
      return `~${Math.round(months)}м`;
    }
  };

  return (
    <div>
      <p className="text-xs text-white/40 mb-3">Рост прибыли по циклам</p>
      <div className="relative" style={{ height: `${chartHeight}px` }}>
        <div className="absolute inset-0 flex items-end gap-2">
          {sampled.map((val, i) => {
            const heightPx = Math.max((val / max) * chartHeight, 8);
            const isLast = i === sampled.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: heightPx }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full rounded-lg"
                  style={{
                    background: isLast
                      ? "linear-gradient(to top, rgba(48, 209, 88, 0.65), rgba(48, 209, 88, 1))"
                      : "linear-gradient(to top, rgba(10, 132, 255, 0.65), rgba(10, 132, 255, 1))",
                    boxShadow: isLast
                      ? "0 0 12px rgba(48, 209, 88, 0.4)"
                      : "0 0 8px rgba(10, 132, 255, 0.3)",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      {/* Labels below chart */}
      <div className="flex gap-2 mt-1">
        {sampled.map((val, i) => {
          const { cycleNum, timeMonths } = getCycleInfo(i);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              {/* Profit amount */}
              <span className="text-2xs text-white/40 leading-none font-medium">
                {val >= 1000 ? `${Math.round(val / 1000)}K` : Math.round(val)}
              </span>
              {/* Cycle number */}
              <span className="text-2xs text-white/20 leading-none font-medium">
                {cycleNum} об.
              </span>
              {/* Time estimate */}
              <span className="text-2xs text-white/20 leading-none">{formatTime(timeMonths)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

export function InvestmentPlannerSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6">
        <div className="h-6 w-32 bg-white/10 rounded mb-1" />
        <div className="h-3 w-44 bg-white/10 rounded mb-4" />

        {/* Presets */}
        <div className="flex gap-2 mb-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-16 bg-white/10 rounded-xl" />
          ))}
        </div>

        {/* Slider */}
        <div className="h-1.5 bg-white/[0.08] rounded-full mb-4" />

        {/* Horizon */}
        <div className="flex justify-between mb-5">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 w-16 bg-white/[0.06] rounded-xl" />
            ))}
          </div>
          <div className="h-5 w-20 bg-white/[0.06] rounded-full" />
        </div>

        {/* Result card */}
        <div className="rounded-xl p-4 bg-white/[0.04] border border-glass-subtle mb-3">
          <div className="h-3 w-32 bg-white/10 rounded mx-auto mb-3" />
          <div className="h-8 w-24 bg-white/10 rounded mx-auto mb-2" />
          <div className="h-1.5 bg-white/[0.06] rounded-full mx-4" />
        </div>

        {/* Waterfall */}
        <div className="space-y-2 mb-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-3 w-28 bg-white/10 rounded" />
              <div className="h-3 w-16 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

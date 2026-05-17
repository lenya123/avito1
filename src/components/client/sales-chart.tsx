"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import type { StatsGranularity } from "@/hooks/use-stats";

export type ChartDataPoint = {
  date: string;
  label: string;
  orders: number;
  revenue: number;
  profit: number;
  invested: number;
};

export type ChartMetric = "orders" | "revenue" | "profit";

export type BarSelectionData = {
  index: number;
  dateFrom: string;
  dateTo: string;
  orders: number;
  invested: number;
  revenue: number;
  profit: number;
  label: string;
} | null;

export interface SalesChartProps {
  data: ChartDataPoint[];
  granularity?: StatsGranularity;
  isLoading?: boolean;
  className?: string;
  onBarSelect?: (selection: BarSelectionData) => void;
}

// Chart colors — see CSS vars --accent-* in globals.css
const METRIC_CONFIG: Record<
  ChartMetric,
  {
    label: string;
    color: string;
    colorRgb: string;
    format: (value: number) => string;
  }
> = {
  orders: {
    label: "Заказы",
    color: "#0A84FF",
    colorRgb: "10, 132, 255",
    format: (v) => v.toString(),
  },
  revenue: {
    label: "Выручка",
    color: "#30D158",
    colorRgb: "48, 209, 88",
    format: (v) => formatPrice(v),
  },
  profit: {
    label: "Прибыль",
    color: "#BF5AF2",
    colorRgb: "191, 90, 242",
    format: (v) => formatPrice(v),
  },
};

/** SVG path с закруглением ТОЛЬКО верхних углов (iOS-стиль, плоское дно).
 *  rx/ry раздельные — компенсируют preserveAspectRatio="none" для ровной дуги 45°. */
function topRoundedPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  ry: number
): string {
  const crx = Math.min(rx, w / 2);
  const cry = Math.min(ry, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + cry}`,
    `Q ${x} ${y} ${x + crx} ${y}`,
    `L ${x + w - crx} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + cry}`,
    `L ${x + w} ${y + h}`,
    `Z`,
  ].join(" ");
}

/** Вычисляет dateFrom/dateTo для бара по его дате и гранулярности */
function getBarDateRange(
  barDate: string,
  granularity: StatsGranularity
): { dateFrom: string; dateTo: string } {
  if (granularity === "day") {
    return { dateFrom: barDate, dateTo: barDate };
  }
  if (granularity === "week") {
    const start = new Date(barDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const y = end.getFullYear();
    const m = String(end.getMonth() + 1).padStart(2, "0");
    const d = String(end.getDate()).padStart(2, "0");
    return { dateFrom: barDate, dateTo: `${y}-${m}-${d}` };
  }
  // month
  const start = new Date(barDate + "T00:00:00");
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return { dateFrom: barDate, dateTo: `${y}-${m}-${d}` };
}

/**
 * Алгоритм "nice numbers" для оси Y:
 * Вычисляет красивый шаг, niceMax и текстовые метки.
 */
function getNiceScale(maxValue: number, desiredTicks = 4) {
  if (maxValue <= 0) {
    return { niceMax: 1, step: 1, labels: ["1", "0"] };
  }

  const rawStep = maxValue / desiredTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const fraction = rawStep / magnitude;

  let niceStep: number;
  if (fraction < 1.5) niceStep = 1;
  else if (fraction < 3) niceStep = 2;
  else if (fraction < 7) niceStep = 5;
  else niceStep = 10;
  niceStep *= magnitude;

  if (niceStep < 1) niceStep = 1;

  const niceMax = Math.ceil(maxValue / niceStep) * niceStep;
  const numTicks = Math.round(niceMax / niceStep);

  const labels: string[] = [];
  for (let i = numTicks; i >= 0; i--) {
    const val = niceStep * i;
    labels.push(formatCompact(val));
  }

  return { niceMax, step: niceStep, labels };
}

/** Сокращённый формат: 1000 → 1K, 50000 → 50K */
function formatCompact(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000) {
    const v = value / 1_000_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const v = value / 1_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}K`;
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function SalesChart({
  data,
  granularity = "day",
  isLoading,
  className,
  onBarSelect,
}: SalesChartProps) {
  const [metric, setMetric] = useState<ChartMetric>("orders");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 800, height: 176 });

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setChartSize({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Визуальный радиус скругления в пикселях → viewBox-координаты с компенсацией aspect ratio
  const VISUAL_RADIUS_PX = 5;
  const cornerRx = (VISUAL_RADIUS_PX * 100) / chartSize.width;
  const cornerRy = (VISUAL_RADIUS_PX * 100) / chartSize.height;

  const config = METRIC_CONFIG[metric];

  const chartInfo = useMemo(() => {
    const displayData = data ?? [];
    if (!displayData.length) return { bars: [], maxValue: 0, yLabels: [] as string[] };

    const values = displayData.map((d) => d[metric]);
    const maxValue = Math.max(...values, 1);
    const { niceMax, labels: yLabels } = getNiceScale(maxValue);

    const count = displayData.length;
    const gap = 1.2;
    const totalWidth = 100;
    const barWidth = (totalWidth - gap * (count - 1)) / count;

    const chartTop = 4;
    const chartBottom = 96;
    const chartHeight = chartBottom - chartTop;

    const bars = displayData.map((d, i) => {
      const value = d[metric];
      const heightPercent = value > 0 ? Math.max((value / niceMax) * chartHeight, 3) : 0;
      return {
        x: i * (barWidth + gap),
        y: chartBottom - heightPercent,
        width: barWidth,
        height: heightPercent,
        value,
        label: d.label,
        date: d.date,
      };
    });

    return { bars, maxValue, yLabels };
  }, [data, metric]);

  const handleBarClick = useCallback(
    (index: number) => {
      const newIndex = selectedIndex === index ? null : index;
      setSelectedIndex(newIndex);

      if (onBarSelect) {
        if (newIndex !== null && data?.[newIndex]) {
          const point = data[newIndex];
          const { dateFrom, dateTo } = getBarDateRange(point.date, granularity);
          onBarSelect({
            index: newIndex,
            dateFrom,
            dateTo,
            orders: point.orders,
            invested: point.invested,
            revenue: point.revenue,
            profit: point.profit,
            label: point.label,
          });
        } else {
          onBarSelect(null);
        }
      }
    },
    [selectedIndex, onBarSelect, data, granularity]
  );

  const handleSvgDeselect = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if ((e.target as SVGElement).tagName === "svg") {
        setSelectedIndex(null);
        onBarSelect?.(null);
      }
    },
    [onBarSelect]
  );

  if (isLoading) {
    return <SalesChartSkeleton className={className} />;
  }

  const uniqueId = `chart-${metric}`;

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
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Заголовок с переключателем метрик */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Динамика</h3>
          <div className="flex gap-1">
            {(Object.keys(METRIC_CONFIG) as ChartMetric[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMetric(m);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-xs font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                  metric === m
                    ? "bg-white/15 text-white"
                    : "text-white/40 hover:text-white/60 hover:bg-white/5"
                )}
              >
                {METRIC_CONFIG[m].label}
              </button>
            ))}
          </div>
        </div>

        {/* Текущее значение при выборе */}
        <div className="h-8 flex items-center">
          {selectedIndex !== null && chartInfo.bars[selectedIndex] ? (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-baseline gap-2"
            >
              <span className="text-2xl font-bold text-white">
                {config.format(chartInfo.bars[selectedIndex].value)}
              </span>
              <span className="text-sm text-white/40">{chartInfo.bars[selectedIndex].label}</span>
            </motion.div>
          ) : (
            <span className="text-sm text-white/40">Нажмите на столбец</span>
          )}
        </div>
      </div>

      {/* График — столбцы */}
      <div ref={chartRef} className="relative h-44 mx-4 mb-4">
        {(data?.length ?? 0) > 0 ? (
          <>
            {/* Подписи оси Y */}
            <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between pointer-events-none z-10 py-[2%]">
              {chartInfo.yLabels.map((label, i) => (
                <span key={i} className="text-2xs text-white/20 leading-none text-right pr-1">
                  {label}
                </span>
              ))}
            </div>

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full pl-8"
              style={{ touchAction: "manipulation" }}
              onClick={handleSvgDeselect}
            >
              <defs>
                {/* Основной градиент столбца */}
                <linearGradient id={`${uniqueId}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity="0.85" />
                  <stop offset="100%" stopColor={config.color} stopOpacity="0.35" />
                </linearGradient>

                {/* Яркий градиент для выбранного столбца */}
                <linearGradient id={`${uniqueId}-fill-selected`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={config.color} stopOpacity="0.65" />
                </linearGradient>

                {/* Блик (inner glow) — стеклянный эффект */}
                <linearGradient id={`${uniqueId}-glow`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="white" stopOpacity="0.25" />
                  <stop offset="35%" stopColor="white" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>

                {/* Фильтр glow для выбранного столбца */}
                <filter id={`${uniqueId}-glow-filter`} x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
                </filter>
              </defs>

              {/* Горизонтальные линии сетки */}
              {chartInfo.yLabels.map((_, i) => {
                const numIntervals = chartInfo.yLabels.length - 1;
                const y = 4 + (92 / numIntervals) * i;
                return (
                  <line
                    key={i}
                    x1="0"
                    y1={y}
                    x2="100"
                    y2={y}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="0.3"
                  />
                );
              })}

              {/* Столбцы */}
              {chartInfo.bars.map((bar, i) => {
                const isSelected = selectedIndex === i;
                const isDimmed = selectedIndex !== null && selectedIndex !== i;
                const crx = Math.min(cornerRx, bar.width / 2);

                return (
                  <g key={i}>
                    {/* Glow за выбранным столбцом */}
                    {isSelected && (
                      <path
                        d={topRoundedPath(
                          bar.x - 0.5,
                          bar.y - 1,
                          bar.width + 1,
                          bar.height + 2,
                          cornerRx,
                          cornerRy
                        )}
                        fill={config.color}
                        opacity="0.4"
                        filter={`url(#${uniqueId}-glow-filter)`}
                      />
                    )}

                    {/* Основное тело столбца */}
                    <path
                      d={topRoundedPath(bar.x, bar.y, bar.width, bar.height, cornerRx, cornerRy)}
                      fill={
                        isSelected ? `url(#${uniqueId}-fill-selected)` : `url(#${uniqueId}-fill)`
                      }
                      opacity={isDimmed ? 0.3 : 1}
                      style={{ transition: "opacity 0.2s ease" }}
                    />

                    {/* Блик (inner glow) — стеклянный эффект */}
                    <path
                      d={topRoundedPath(bar.x, bar.y, bar.width, bar.height, cornerRx, cornerRy)}
                      fill={`url(#${uniqueId}-glow)`}
                      opacity={isDimmed ? 0.15 : isSelected ? 0.5 : 0.3}
                      style={{ transition: "opacity 0.2s ease" }}
                    />

                    {/* Верхняя кромка — тонкая белая линия */}
                    {bar.height > 3 && (
                      <line
                        x1={bar.x + crx}
                        y1={bar.y + 0.2}
                        x2={bar.x + bar.width - crx}
                        y2={bar.y + 0.2}
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="0.3"
                        opacity={isDimmed ? 0.15 : isSelected ? 0.6 : 0.3}
                        style={{ transition: "opacity 0.2s ease" }}
                      />
                    )}

                    {/* Невидимая область для click — на всю высоту */}
                    <rect
                      x={bar.x}
                      y="0"
                      width={bar.width}
                      height="100"
                      fill="transparent"
                      onClick={() => handleBarClick(i)}
                      className="cursor-pointer"
                    />
                  </g>
                );
              })}
            </svg>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-white/40 text-sm">
            Нет данных за период
          </div>
        )}
      </div>

      {/* Подписи дат */}
      {(data?.length ?? 0) > 0 && (
        <div className="flex justify-between px-4 pb-3">
          {chartInfo.bars
            .filter(
              (_, i) =>
                i === 0 ||
                i === Math.floor(chartInfo.bars.length / 2) ||
                i === chartInfo.bars.length - 1
            )
            .map((bar, i) => (
              <span key={i} className="text-2xs text-white/20">
                {bar.label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

export function SalesChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-20 bg-white/10 rounded" />
          <div className="flex gap-1">
            <div className="h-6 w-16 bg-white/10 rounded-xl" />
            <div className="h-6 w-16 bg-white/10 rounded-xl" />
            <div className="h-6 w-16 bg-white/10 rounded-xl" />
          </div>
        </div>
        <div className="h-8 w-24 bg-white/10 rounded mt-2" />
      </div>
      <div className="h-44 mx-4 mb-4 bg-white/5 rounded-xl" />
      <div className="flex justify-between px-4 pb-3">
        <div className="h-3 w-12 bg-white/10 rounded" />
        <div className="h-3 w-12 bg-white/10 rounded" />
        <div className="h-3 w-12 bg-white/10 rounded" />
      </div>
    </div>
  );
}

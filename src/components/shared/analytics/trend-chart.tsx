"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { buildSmoothPath, buildSmoothAreaPath, niceMax } from "@/utils/svg-chart";

interface ChartPoint {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
  aov: number;
  roiPercent: number;
  /** Σ расходов за бакет (метрика «Расходы»). */
  expenses: number;
}

interface TrendChartProps {
  data: ChartPoint[];
  comparisonData?: ChartPoint[] | null;
}

type MetricKey = "revenue" | "profit" | "orders" | "aov" | "roiPercent" | "expenses";

const METRICS: Array<{
  key: MetricKey;
  label: string;
  color: string;
  cssVar: string;
  format: (v: number) => string;
  unit: "currency" | "count" | "percent";
}> = [
  {
    key: "profit",
    label: "Прибыль",
    color: "#30D158",
    cssVar: "var(--accent-green)",
    format: (v) => formatPrice(v),
    unit: "currency",
  },
  {
    key: "revenue",
    label: "Выручка",
    color: "#BF5AF2",
    cssVar: "var(--accent-purple)",
    format: (v) => formatPrice(v),
    unit: "currency",
  },
  {
    key: "orders",
    label: "Заказы",
    color: "#0A84FF",
    cssVar: "var(--accent-blue)",
    format: (v) => `${v}`,
    unit: "count",
  },
  {
    key: "aov",
    label: "Ср. чек",
    color: "#FF9F0A",
    cssVar: "var(--accent-orange)",
    format: (v) => formatPrice(v),
    unit: "currency",
  },
  {
    key: "roiPercent",
    label: "ROI %",
    color: "#64D2FF",
    cssVar: "var(--accent-teal)",
    format: (v) => `${v}%`,
    unit: "percent",
  },
  {
    key: "expenses",
    label: "Расходы",
    color: "#FF2D55",
    cssVar: "var(--accent-pink)",
    format: (v) => formatPrice(v),
    unit: "currency",
  },
];

// SVG chart dimensions
const CHART_W = 800;
const CHART_H = 300;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 36;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function localBuildAreaPath(points: Array<{ x: number; y: number }>): string {
  return buildSmoothAreaPath(points, PAD_T + PLOT_H);
}

export function TrendChart({ data, comparisonData }: TrendChartProps) {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    () => new Set<MetricKey>(["profit"])
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleMetric = useCallback((key: MetricKey) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const activeMetricsList = useMemo(
    () => METRICS.filter((m) => activeMetrics.has(m.key)),
    [activeMetrics]
  );

  // Calculate scales
  const { yMax, yLabels } = useMemo(() => {
    if (data.length === 0) return { yMax: 100, yLabels: [] };
    let max = 0;
    for (const m of activeMetricsList) {
      for (const d of data) {
        max = Math.max(max, d[m.key]);
      }
    }
    const nice = niceMax(max);
    const labels: number[] = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      labels.push(Math.round((nice / steps) * i));
    }
    return { yMax: nice, yLabels: labels };
  }, [data, activeMetricsList]);

  const getPoints = useCallback(
    (metric: MetricKey, chartData: ChartPoint[]) => {
      return chartData.map((d, i) => ({
        x: PAD_L + (chartData.length > 1 ? (i / (chartData.length - 1)) * PLOT_W : PLOT_W / 2),
        y: PAD_T + PLOT_H - (yMax > 0 ? (d[metric] / yMax) * PLOT_H : 0),
      }));
    },
    [yMax]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || !containerRef.current || data.length === 0) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - svgRect.left) / svgRect.width) * CHART_W;
      const relX = x - PAD_L;
      const idx = Math.round((relX / PLOT_W) * (data.length - 1));
      const clampedIdx = Math.max(0, Math.min(data.length - 1, idx));
      setHoveredIndex(clampedIdx);

      // Calculate exact data point X position in container coordinates
      const pointSvgX =
        PAD_L + (data.length > 1 ? (clampedIdx / (data.length - 1)) * PLOT_W : PLOT_W / 2);
      const pointDomX = (pointSvgX / CHART_W) * svgRect.width + svgRect.left - containerRect.left;
      setTooltipPos({
        x: pointDomX,
        y: 0,
      });
    },
    [data.length]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    setTooltipPos(null);
  }, []);

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Динамика</h3>
          <p className="text-center text-white/40 py-12">Нет данных для отображения</p>
        </div>
      </div>
    );
  }

  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoveredX =
    hoveredIndex !== null
      ? PAD_L + (data.length > 1 ? (hoveredIndex / (data.length - 1)) * PLOT_W : PLOT_W / 2)
      : 0;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-white">Динамика</h3>

          {/* Metric toggles */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap",
                  "backdrop-blur-xl border transition-all duration-200",
                  activeMetrics.has(m.key)
                    ? "text-white border-glass-strong shadow-card"
                    : "text-white/40 border-glass-subtle shadow-glass-inset hover:text-white/60"
                )}
                style={
                  activeMetrics.has(m.key)
                    ? { backgroundColor: `${m.color}20`, borderColor: `${m.color}40` }
                    : undefined
                }
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{
                    backgroundColor: activeMetrics.has(m.key) ? m.color : "rgba(255,255,255,0.2)",
                  }}
                />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Chart */}
        <div ref={containerRef} className="relative w-full">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full h-auto"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              {activeMetricsList.map((m) => (
                <linearGradient key={m.key} id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={m.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>

            {/* Y-axis grid lines */}
            {yLabels.map((v, i) => {
              const y = PAD_T + PLOT_H - (yMax > 0 ? (v / yMax) * PLOT_H : 0);
              return (
                <g key={i}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={PAD_L + PLOT_W}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_L - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="rgba(255,255,255,0.3)"
                    fontSize={10}
                  >
                    {v >= 1000 ? `${Math.round(v / 1000)}K` : v}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {data.map((d, i) => {
              if (data.length > 14 && i % Math.ceil(data.length / 7) !== 0 && i !== data.length - 1)
                return null;
              const x = PAD_L + (data.length > 1 ? (i / (data.length - 1)) * PLOT_W : PLOT_W / 2);
              const label = new Date(d.date).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
              });
              return (
                <text
                  key={d.date}
                  x={x}
                  y={CHART_H - 8}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.3)"
                  fontSize={10}
                >
                  {label}
                </text>
              );
            })}

            {/* Comparison lines (dashed) */}
            {comparisonData &&
              activeMetricsList.map((m) => {
                const points = getPoints(m.key, comparisonData);
                return (
                  <path
                    key={`comp-${m.key}`}
                    d={buildSmoothPath(points)}
                    fill="none"
                    stroke={m.color}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    opacity={0.3}
                  />
                );
              })}

            {/* Area fills */}
            {activeMetricsList.map((m) => {
              const points = getPoints(m.key, data);
              return (
                <motion.path
                  key={`area-${m.key}`}
                  d={localBuildAreaPath(points)}
                  fill={`url(#grad-${m.key})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                />
              );
            })}

            {/* Lines */}
            {activeMetricsList.map((m) => {
              const points = getPoints(m.key, data);
              return (
                <motion.path
                  key={`line-${m.key}`}
                  d={buildSmoothPath(points)}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              );
            })}

            {/* Persistent dots when few data points */}
            {data.length <= 14 &&
              activeMetricsList.map((m) => {
                const points = getPoints(m.key, data);
                return points.map((p, pi) => (
                  <circle
                    key={`pdot-${m.key}-${pi}`}
                    cx={p.x}
                    cy={p.y}
                    r={2.5}
                    fill={m.color}
                    opacity={hoveredIndex === pi ? 1 : 0.5}
                  />
                ));
              })}

            {/* Hover highlight column */}
            {hoveredIndex !== null && (
              <rect
                x={hoveredX - 15}
                y={PAD_T}
                width={30}
                height={PLOT_H}
                fill="rgba(255,255,255,0.04)"
                rx={4}
              />
            )}

            {/* Hover dots */}
            {hoveredIndex !== null &&
              activeMetricsList.map((m) => {
                const points = getPoints(m.key, data);
                const p = points[hoveredIndex];
                return (
                  <circle
                    key={`dot-${m.key}`}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill={m.color}
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth={1.5}
                  />
                );
              })}
          </svg>

          {/* Tooltip — anchored to data point X, vertically centered in chart */}
          {hoveredPoint &&
            tooltipPos &&
            (() => {
              const containerW = containerRef.current?.clientWidth ?? 600;
              const isRightHalf = tooltipPos.x > containerW / 2;
              return (
                <div
                  className="absolute z-10 pointer-events-none"
                  style={{
                    left: tooltipPos.x,
                    top: "35%",
                    transform: isRightHalf
                      ? "translate(calc(-100% - 16px), -50%)"
                      : "translate(16px, -50%)",
                  }}
                >
                  <div className="p-2.5 rounded-xl bg-[rgba(20,20,25,0.92)] backdrop-blur-xl border border-glass-subtle shadow-lg whitespace-nowrap">
                    <p className="text-2xs text-white/40 mb-1">
                      {new Date(hoveredPoint.date).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {activeMetricsList.map((m) => {
                        const compPoint =
                          comparisonData &&
                          hoveredIndex !== null &&
                          hoveredIndex < comparisonData.length
                            ? comparisonData[hoveredIndex]
                            : null;
                        return (
                          <div key={m.key} className="flex items-center gap-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: m.color }}
                            />
                            <span className="text-2xs text-white/50">{m.label}</span>
                            <span className="text-2xs font-medium text-white ml-auto">
                              {m.format(hoveredPoint[m.key])}
                            </span>
                            {compPoint && (
                              <span className="text-2xs text-white/30 ml-1">
                                / {m.format(compPoint[m.key])}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

export function TrendChartSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-white/10 rounded" />
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 w-20 bg-white/[0.06] rounded-xl" />
            ))}
          </div>
        </div>
        <div className="h-64 bg-white/[0.04] rounded-xl" />
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { cn } from "@/utils/cn";

type Granularity = "day" | "week" | "month";

interface ProductSalesChartProps {
  data: Array<{ date: string; count: number }>;
  granularity?: Granularity;
}

function topRoundedPath(x: number, y: number, w: number, h: number, rx: number, ry: number) {
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

const GRANULARITY_BADGE: Record<Granularity, string> = {
  day: "По дням",
  week: "По неделям",
  month: "По месяцам",
};

function formatLabel(dateStr: string, granularity: Granularity) {
  const d = new Date(dateStr + "T00:00:00");
  if (granularity === "month") {
    return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }).replace(".", "");
  }
  if (granularity === "week") {
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

function pluralOrders(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заказ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "заказа";
  return "заказов";
}

function formatHoverLabel(dateStr: string, count: number, granularity: Granularity) {
  const d = new Date(dateStr + "T00:00:00");
  const orders = `${count} ${pluralOrders(count)}`;
  if (granularity === "month") {
    const month = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    return `${orders} за ${month}`;
  }
  if (granularity === "week") {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const from = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
    const to = end.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
    return `${orders}, ${from} – ${to}`;
  }
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${orders}, ${day}`;
}

export function ProductSalesChart({ data, granularity = "day" }: ProductSalesChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 600, height: 80 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  const VISUAL_RADIUS_PX = 5;
  const cornerRx = (VISUAL_RADIUS_PX * 100) / chartSize.width;
  const cornerRy = (VISUAL_RADIUS_PX * 100) / chartSize.height;

  const hasAnyOrders = data.some((d) => d.count > 0);

  const chartInfo = useMemo(() => {
    if (!data.length) return { bars: [], maxValue: 0 };

    const maxValue = Math.max(...data.map((d) => d.count), 1);
    const count = data.length;
    const gap = 0.8;
    const totalWidth = 100;
    const barWidth = (totalWidth - gap * (count - 1)) / count;

    const chartTop = 4;
    const chartBottom = 92;
    const chartHeight = chartBottom - chartTop;

    const bars = data.map((d, i) => {
      const heightPercent = d.count > 0 ? Math.max((d.count / maxValue) * chartHeight, 3) : 0;
      return {
        x: i * (barWidth + gap),
        y: chartBottom - heightPercent,
        width: barWidth,
        height: heightPercent,
        value: d.count,
        date: d.date,
      };
    });

    return { bars, maxValue };
  }, [data]);

  if (!hasAnyOrders) return null;

  // Labels: first, middle, last
  const labelIndices = [0, Math.floor(data.length / 2), data.length - 1].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );

  return (
    <div className="pt-4 border-t border-glass">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-white/60">Динамика продаж</p>
          <span className="px-1.5 py-0.5 rounded-lg bg-white/[0.06] text-2xs text-white/40">
            {GRANULARITY_BADGE[granularity]}
          </span>
        </div>
        {hoveredIndex !== null && chartInfo.bars[hoveredIndex] && (
          <p className="text-xs text-white/60">
            {formatHoverLabel(
              chartInfo.bars[hoveredIndex].date,
              chartInfo.bars[hoveredIndex].value,
              granularity
            )}
          </p>
        )}
      </div>

      <div ref={chartRef} className="relative h-20">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="product-bar-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0A84FF" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0A84FF" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="product-bar-fill-hover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0A84FF" stopOpacity="1" />
              <stop offset="100%" stopColor="#0A84FF" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="product-bar-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.2" />
              <stop offset="35%" stopColor="white" stopOpacity="0.05" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 1, 2].map((i) => (
            <line
              key={i}
              x1="0"
              y1={4 + (88 / 2) * i}
              x2="100"
              y2={4 + (88 / 2) * i}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.3"
            />
          ))}

          {/* Bars */}
          {chartInfo.bars.map((bar, i) => {
            if (bar.height === 0) return null;
            const isHovered = hoveredIndex === i;
            return (
              <g key={i}>
                <path
                  d={topRoundedPath(bar.x, bar.y, bar.width, bar.height, cornerRx, cornerRy)}
                  fill={isHovered ? "url(#product-bar-fill-hover)" : "url(#product-bar-fill)"}
                  style={{ transition: "fill 0.15s ease" }}
                />
                <path
                  d={topRoundedPath(bar.x, bar.y, bar.width, bar.height, cornerRx, cornerRy)}
                  fill="url(#product-bar-glow)"
                  opacity={isHovered ? 0.4 : 0.2}
                />
                <rect
                  x={bar.x}
                  y="0"
                  width={bar.width}
                  height="100"
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                  className="cursor-pointer"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Date labels */}
      <div className="flex justify-between mt-1">
        {labelIndices.map((idx) => (
          <span key={idx} className={cn("text-2xs text-white/20")}>
            {formatLabel(data[idx].date, granularity)}
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { sizeOrder } from "@/utils/sizes";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface ProductTableProps {
  products: AnalyticsResponse["products"];
  className?: string;
}

const RANK_STYLES: Record<number, string> = {
  0: "text-accent-orange",
  1: "text-white/60",
  2: "text-accent-orange",
};

function sortSizeEntries(sizes: Record<string, number>): [string, number][] {
  return Object.entries(sizes).sort(([a], [b]) => {
    const ia = sizeOrder.indexOf(a);
    const ib = sizeOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

type SortKey = "profit" | "revenue" | "roi" | "orders" | "returns";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "profit", label: "По прибыли" },
  { key: "revenue", label: "По выручке" },
  { key: "roi", label: "По ROI" },
  { key: "orders", label: "По заказам" },
  { key: "returns", label: "По возвратам" },
];

function sortProducts(products: AnalyticsResponse["products"], sortKey: SortKey) {
  return [...products].sort((a, b) => {
    switch (sortKey) {
      case "profit":
        return b.totalProfit - a.totalProfit;
      case "revenue":
        return b.totalRevenue - a.totalRevenue;
      case "roi":
        return b.roi - a.roi;
      case "orders":
        return b.ordersCount - a.ordersCount;
      case "returns":
        return b.returnRate - a.returnRate;
      default:
        return 0;
    }
  });
}

export function ProductTable({ products, className }: ProductTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("profit");

  if (products.length === 0) return null;

  const sorted = sortProducts(products, sortKey);

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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Топ товары</h3>
          <span className="text-sm font-medium text-white/60 px-3 py-1 rounded-full bg-white/[0.06] border border-glass-subtle backdrop-blur-xl shadow-glass-inset">
            {products.length}
          </span>
        </div>

        {/* Sort tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              className={cn(
                "px-2.5 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap",
                "backdrop-blur-xl border transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                sortKey === opt.key
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
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {sorted.map((product, i) => {
            const isExpanded = expandedId === product.id;

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : product.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                    "bg-gradient-to-b from-white/[0.04] to-transparent",
                    "border border-glass-subtle",
                    "hover:border-glass hover:from-white/[0.06]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                    isExpanded && "border-glass from-white/[0.06]"
                  )}
                >
                  {/* Rank */}
                  <span
                    className={cn(
                      "text-sm font-bold w-5 shrink-0 text-center",
                      RANK_STYLES[i] || "text-white/40"
                    )}
                  >
                    {i + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/[0.08] shrink-0">
                    {product.photoUrl ? (
                      <img
                        src={product.photoUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-white/20">
                        📦
                      </div>
                    )}
                  </div>

                  {/* Name + orders + return dot */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm text-white truncate">{product.name}</p>
                    <p className="text-xs text-white/40">{product.ordersCount} заказов</p>
                  </div>

                  {/* Adaptive right column */}
                  <div className="text-right shrink-0">
                    {sortKey === "returns" ? (
                      <>
                        <p
                          className={cn(
                            "text-sm font-medium",
                            product.returnRate > 15
                              ? "text-accent-red"
                              : product.returnRate > 0
                                ? "text-accent-orange"
                                : "text-accent-green"
                          )}
                        >
                          {product.returnRate}%
                        </p>
                        <p className="text-xs text-accent-red/60">
                          {product.returnLoss > 0
                            ? `−${formatPrice(product.returnLoss)}`
                            : formatPrice(0)}
                        </p>
                      </>
                    ) : sortKey === "revenue" ? (
                      <>
                        <p className="text-sm font-medium text-accent-green">
                          {formatPrice(product.totalRevenue)}
                        </p>
                        <p className="text-xs text-white/40">ROI {product.roi}%</p>
                      </>
                    ) : sortKey === "roi" ? (
                      <>
                        <p className="text-sm font-medium text-accent-green">ROI {product.roi}%</p>
                        <p className="text-xs text-white/40">{formatPrice(product.totalProfit)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-accent-green">
                          {formatPrice(product.totalProfit)}
                        </p>
                        <p className="text-xs text-white/40">ROI {product.roi}%</p>
                      </>
                    )}
                  </div>

                  {/* Chevron */}
                  <svg
                    className={cn(
                      "w-4 h-4 text-white/20 transition-transform shrink-0",
                      isExpanded && "rotate-180"
                    )}
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
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 py-3 mt-1 rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.03] border border-glass-subtle">
                        {/* Stats grid 2x2 */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-b from-white/[0.05] to-transparent border border-glass-subtle shadow-glass-inset">
                            <span className="text-xs text-white/40">Вложено</span>
                            <span className="text-xs font-medium text-white/80">
                              {formatPrice(product.totalInvested)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-b from-white/[0.05] to-transparent border border-glass-subtle shadow-glass-inset">
                            <span className="text-xs text-white/40">Выручка</span>
                            <span className="text-xs font-medium text-white/80">
                              {formatPrice(product.totalRevenue)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-b from-white/[0.05] to-transparent border border-glass-subtle shadow-glass-inset">
                            <span className="text-xs text-white/40">Возвраты</span>
                            <span
                              className={cn(
                                "text-xs font-medium",
                                product.returnRate > 15
                                  ? "text-accent-red"
                                  : product.returnRate > 0
                                    ? "text-accent-orange"
                                    : "text-accent-green"
                              )}
                            >
                              {product.returnRate}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-b from-white/[0.05] to-transparent border border-glass-subtle shadow-glass-inset">
                            <span className="text-xs text-white/40">Приб./заказ</span>
                            <span className="text-xs font-medium text-white/80">
                              {formatPrice(product.avgProfitPerOrder)}
                            </span>
                          </div>
                        </div>

                        {/* Size distribution */}
                        {Object.keys(product.sizes).length > 0 &&
                          (() => {
                            const maxSizeCount = Math.max(...Object.values(product.sizes));
                            const totalSizesCount = Object.values(product.sizes).reduce(
                              (s, v) => s + v,
                              0
                            );
                            return (
                              <div>
                                <p className="text-xs text-white/40 mb-2">Размеры</p>
                                <div className="space-y-2">
                                  {sortSizeEntries(product.sizes).map(([size, count]) => {
                                    const pct = Math.round((count / totalSizesCount) * 100);
                                    const barW = pct;
                                    const ratio = count / maxSizeCount;
                                    const opacity = 0.35 + ratio * 0.65;
                                    return (
                                      <div key={size} className="flex items-center gap-2">
                                        <span className="text-xs font-medium w-8 text-white/60">
                                          {size}
                                        </span>
                                        <div className="flex-1 h-2.5 rounded-full bg-white/[0.15] border border-glass-minimal overflow-hidden">
                                          <div
                                            className="h-full bg-accent-blue rounded-r-full border-r-2 border-accent-blue/30 transition-all"
                                            style={{ width: `${barW}%`, opacity }}
                                          />
                                        </div>
                                        <span className="text-xs text-white/40 w-16 text-right tabular-nums">
                                          {count} ({pct}%)
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ProductTableSkeleton() {
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
        <div className="h-6 w-28 bg-white/10 rounded mb-5" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle"
            >
              <div className="w-5 h-4 bg-white/10 rounded shrink-0" />
              <div className="w-8 h-8 bg-white/10 rounded-lg shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-28 bg-white/10 rounded mb-1" />
                <div className="h-3 w-16 bg-white/10 rounded" />
              </div>
              <div className="text-right">
                <div className="h-4 w-16 bg-white/10 rounded mb-1" />
                <div className="h-3 w-12 bg-white/10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

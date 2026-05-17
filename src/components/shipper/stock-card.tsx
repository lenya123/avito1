"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { sortSizeEntries } from "@/utils/sizes";
import type { StockProduct } from "@/hooks/use-shipper-stock";

interface StockCardProps {
  product: StockProduct;
  onClick: () => void;
  onCreateOrder?: () => void;
}

export function StockCard({ product, onClick, onCreateOrder }: StockCardProps) {
  const sortedSizes = sortSizeEntries(product.sizes);
  const hasSizes = sortedSizes.length > 0;
  const inStock = product.totalAvailable > 0;
  const isLowStock = inStock && product.totalAvailable <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "group relative rounded-2xl overflow-hidden cursor-pointer",
        "backdrop-blur-xl",
        "shadow-card",
        "active:border-glass-active",
        "transition-all duration-150",
        inStock
          ? isLowStock
            ? "bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-l-2 border-l-[#ff9f0a] border-r border-r-glass border-y border-y-glass"
            : "bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-l-2 border-l-[#30d158] border-r border-r-glass border-y border-y-glass"
          : "bg-gradient-to-b from-white/[0.05] to-white/[0.02] border-l-2 border-l-[rgba(255,69,58,0.5)] border-r border-r-glass border-y border-y-glass opacity-80"
      )}
    >
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Внутренний градиент от бокового бордера */}
      <div
        className="absolute inset-y-0 left-0 w-16 pointer-events-none"
        style={{
          background: `linear-gradient(to right, ${
            inStock
              ? isLowStock
                ? "rgba(255,159,10,0.06)"
                : "rgba(48,209,88,0.05)"
              : "rgba(255,69,58,0.04)"
          }, transparent)`,
        }}
      />

      <div className="flex gap-3 p-3 w-full relative">
        {/* Фото */}
        <div
          className={cn(
            "relative w-[56px] h-[56px] rounded-xl overflow-hidden flex-shrink-0",
            "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
            "border border-glass-subtle",
            "shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
          )}
        >
          {product.photoUrl ? (
            <Image src={product.photoUrl} alt={product.name} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Информация */}
        <div className="flex-1 min-w-0">
          {/* Название + заказ + количество */}
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <p className="text-[13px] font-semibold text-white truncate">{product.name}</p>
            <span className="flex items-baseline gap-2 flex-shrink-0">
              {onCreateOrder && inStock && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateOrder();
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded-lg text-[11px] font-medium",
                    "bg-accent-blue/15 text-accent-blue/80",
                    "active:bg-accent-blue/25 active:text-accent-blue",
                    "transition-colors"
                  )}
                >
                  + Заказ
                </button>
              )}
              <span className="flex items-baseline gap-0.5">
                <span
                  className={cn(
                    "text-[14px] font-bold tabular-nums",
                    inStock ? "text-accent-green" : "text-accent-red/70"
                  )}
                >
                  {product.totalCurrent}
                </span>
                {product.totalActual !== null && (
                  <span
                    className={cn(
                      "text-[12px] font-semibold tabular-nums",
                      product.totalActual !== product.totalCurrent
                        ? "text-amber-400"
                        : "text-white/40"
                    )}
                  >
                    /{product.totalActual}
                  </span>
                )}
                <span className="text-[10px] text-white/30 font-medium">шт</span>
              </span>
            </span>
          </div>

          {product.brand && <p className="text-[11px] text-white/50 mb-1">{product.brand}</p>}

          {/* Размерная сетка */}
          {hasSizes && (
            <div className="flex flex-wrap gap-1 mt-1">
              {sortedSizes.map((s) => {
                const hasDiscrepancy =
                  s.actualQuantity !== null && s.actualQuantity !== s.currentQuantity;
                return (
                  <span
                    key={s.id}
                    className={cn(
                      "px-1.5 py-0.5 text-[10px] font-medium rounded-md",
                      hasDiscrepancy
                        ? "bg-amber-500/15 text-amber-400/90"
                        : s.currentQuantity > 0
                          ? "bg-white/[0.08] text-white/70"
                          : "bg-accent-red/10 text-accent-red/70"
                    )}
                  >
                    {s.size}:{s.currentQuantity}
                    {s.actualQuantity !== null && (
                      <span
                        className={cn(
                          "ml-0.5",
                          hasDiscrepancy ? "text-amber-400" : "text-white/40"
                        )}
                      >
                        /{s.actualQuantity}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {/* Зарезервировано */}
          {product.totalReserved > 0 && (
            <p className="text-[10px] text-white/30 mt-1">
              Зарезервировано: {product.totalReserved}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function StockCardSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex gap-3 p-3 items-center">
        <div className="w-[56px] h-[56px] rounded-xl bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="flex justify-between items-baseline">
            <div className="h-4 w-2/3 bg-white/10 rounded" />
            <div className="h-4 w-8 bg-white/10 rounded" />
          </div>
          <div className="h-3 w-1/4 bg-white/10 rounded" />
          <div className="flex gap-1">
            <div className="h-5 w-10 bg-white/10 rounded-md" />
            <div className="h-5 w-10 bg-white/10 rounded-md" />
            <div className="h-5 w-10 bg-white/10 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

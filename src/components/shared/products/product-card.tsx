"use client";

import Link from "next/link";
import Image from "next/image";
import { Skeleton } from "@/components/ui";
import { cn } from "@/utils/cn";
import { sortSizeEntries } from "@/utils/sizes";
import type { ProductListItem } from "@/hooks/use-owner-products";

interface ProductCardProps {
  product: ProductListItem;
  index?: number;
  /** Base URL for detail link. Defaults to "/owner". */
  baseUrl?: string;
}

export function ProductCard({ product, baseUrl = "/owner" }: ProductCardProps) {
  const sortedSizes = sortSizeEntries(product.sizes);
  const lowStock =
    product.totalStock > 0 &&
    product.totalInitial > 0 &&
    product.totalStock / product.totalInitial <= 0.2;
  // Три статуса:
  //   В наличии  — is_in_stock = true (триггер уже учитывает партнёрский сток).
  //   В пути     — is_in_stock = false и владелец указал дату приезда.
  //   Распродан  — is_in_stock = false без даты приезда: товара нет нигде
  //                и докупать не планируется.
  const isAvailable = product.isInStock;
  const isInTransit = !product.isInStock && !!product.expectedArrivalDate;
  const isSoldOut = !product.isInStock && !product.expectedArrivalDate;

  return (
    <Link
      href={`${baseUrl}/products/${product.id}`}
      className={cn(
        "group relative flex rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        "hover:from-white/[0.10] hover:to-white/[0.06] hover:border-glass-active",
        "active:scale-[0.98]",
        "transition-all duration-150"
      )}
    >
      {/* Photo — left side */}
      <div className="relative w-[100px] sm:w-[130px] aspect-[4/5] flex-shrink-0 bg-black/40 overflow-hidden">
        {product.photoUrl ? (
          <Image
            src={product.photoUrl}
            alt={product.name}
            fill
            loading="eager"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="130px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/20">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Content — right side */}
      <div className="flex-1 p-3 sm:p-4 flex flex-col min-w-0">
        {/* Name */}
        <h3 className="text-sm sm:text-base font-medium text-white line-clamp-2 leading-snug mb-2">
          {product.name}
        </h3>

        {/* Status row: Premium/Active + Stock indicator */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          {/* Premium badge */}
          {product.isPremium && (
            <div
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full",
                "bg-[rgba(50,50,50,0.9)]",
                "border border-glass-active",
                "shadow-[0_2px_10px_rgba(0,0,0,0.25),0_0_12px_rgba(255,159,10,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]"
              )}
            >
              <span className="text-2xs font-semibold uppercase tracking-wide text-accent-orange">
                PREMIUM
              </span>
            </div>
          )}

          {/* Active/Inactive badge */}
          {!product.isActive && (
            <div
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full",
                "bg-[rgba(50,50,50,0.9)]",
                "border border-glass-active",
                "shadow-[0_2px_10px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.18)]"
              )}
            >
              <span className="text-2xs font-semibold uppercase tracking-wide text-white/60">
                НЕАКТИВЕН
              </span>
            </div>
          )}

          {/* Stock status dot + text */}
          <div className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isAvailable &&
                  "bg-accent-green shadow-[0_0_3px_0_rgb(var(--accent-green))] animate-pulse",
                isInTransit &&
                  "bg-accent-orange shadow-[0_0_3px_0_rgb(var(--accent-orange))] animate-pulse",
                isSoldOut && "bg-accent-red shadow-[0_0_3px_0_rgb(var(--accent-red))]"
              )}
            />
            <span
              className={cn(
                "text-xs font-medium",
                isAvailable && "text-accent-green",
                isInTransit && "text-accent-orange",
                isSoldOut && "text-accent-red"
              )}
            >
              {isAvailable && "В наличии"}
              {isInTransit && "В пути"}
              {isSoldOut && "Распродан"}
            </span>
          </div>

          {/* Arrival date */}
          {isInTransit && product.expectedArrivalDate && (
            <span className="text-xs text-white/40">
              {new Date(product.expectedArrivalDate).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>

        {/* Prices */}
        <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
          <span className="text-white text-sm sm:text-base font-bold leading-none">
            {product.dropPrice.toLocaleString("ru-RU")} ₽
          </span>
          <span className="text-xs text-white/40 leading-none">
            закуп {product.purchasePrice.toLocaleString("ru-RU")} ₽
          </span>
        </div>

        {/* Sizes */}
        {sortedSizes.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {sortedSizes.slice(0, 6).map((size) => (
              <span
                key={size.size}
                className={cn(
                  "h-6 px-1.5 flex items-center justify-center text-xs font-medium rounded-lg",
                  "transition-all duration-200",
                  size.current > 0
                    ? "border border-glass-active bg-[rgba(60,60,60,0.9)] text-white/80 shadow-card"
                    : "border border-white/[0.08] bg-transparent text-white/20"
                )}
              >
                {size.size}: {size.current}/{size.initial}
              </span>
            ))}
            {sortedSizes.length > 6 && (
              <span className="text-xs text-white/40 ml-1 font-medium">
                +{sortedSizes.length - 6}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="h-6 px-2.5 flex items-center justify-center text-xs font-medium rounded-lg border border-glass-active bg-[rgba(60,60,60,0.9)] text-white/80 shadow-card">
              One Size
            </span>
          </div>
        )}

        {/* Stats — bottom */}
        <div className="mt-auto pt-2.5 flex items-center gap-3">
          {/* Остаток */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-lg",
              "bg-white/[0.04] border border-glass-minimal"
            )}
          >
            <svg
              className={cn("w-3.5 h-3.5", lowStock ? "text-accent-orange" : "text-white/40")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <span
              className={cn(
                "text-xs font-semibold",
                lowStock ? "text-accent-orange" : "text-white"
              )}
            >
              {product.totalStock}
            </span>
            <span className="text-xs text-white/40">В наличии</span>
          </div>

          {/* Продано */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-glass-minimal">
            <svg
              className="w-3.5 h-3.5 text-accent-green"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs font-semibold text-white">{product.sales.sold}</span>
            <span className="text-xs text-white/40">Продано</span>
          </div>

          {/* Недостача — только если есть потери по сверкам */}
          {product.loss.units > 0 && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent-red/10 border border-accent-red/25"
              title={`Недостача по инвентаризации: ${product.loss.units} шт${
                product.loss.rub > 0
                  ? ` · ${Math.round(product.loss.rub).toLocaleString("ru-RU")} ₽`
                  : ""
              }`}
            >
              <svg
                className="w-3.5 h-3.5 text-accent-red"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-xs font-semibold text-accent-red">−{product.loss.units}</span>
              <span className="text-xs text-accent-red/70">Недостача</span>
            </div>
          )}
        </div>

        {/* ROI-полоса окупаемости: revenue / (purchasePrice × totalInitial).
            Заполняется до 100% — закупка отбита; если выше 100% — уже
            прибыльный товар (зелёная заливка). */}
        <ProductPaybackBar
          purchasePrice={product.purchasePrice}
          totalInitial={product.totalInitial}
          revenue={product.sales.revenue}
        />
      </div>
    </Link>
  );
}

/** Полоса окупаемости — оригинальная механика из бывшей вкладки «Товары»
 *  на Финансах: paybackPercent = выручка / вложено × 100. Фаза 1 (<100%):
 *  бар заполняется линейно 0→100% (красный <50, оранжевый 50–99). Фаза 2
 *  (≥100%): бар сбрасывается каждые 100% и заполняется текущий 100-юнит
 *  диапазон ROI (зелёный с glow), справа метка «100-200%»/«200-300%»/…
 *  Под баром: «Осталось: X ₽» (пока не отбили) или «Заработано: +X ₽»
 *  (когда уже в плюсе). Карточки без данных (totalInitial=0) показывают
 *  плоский серый бар с подписью «Нет данных» — высота карточек ровная. */
function ProductPaybackBar({
  purchasePrice,
  totalInitial,
  revenue,
}: {
  purchasePrice: number;
  totalInitial: number;
  revenue: number;
}) {
  const totalInvested = purchasePrice * totalInitial;
  const hasData = totalInvested > 0;

  // Без данных — заглушка той же высоты, чтобы карточки не прыгали.
  if (!hasData) {
    return (
      <div className="mt-3 pt-2.5 border-t border-glass-subtle">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden" />
            <span className="text-xs font-medium text-white/30 shrink-0">—</span>
          </div>
          <p className="text-xs text-white/30">Нет данных по окупаемости</p>
        </div>
      </div>
    );
  }

  const paybackPercent = Math.round((revenue / totalInvested) * 1000) / 10;
  const profit = revenue - totalInvested;
  const isPayback = paybackPercent < 100;

  // Bar fill: фаза 1 — линейно до 100; фаза 2 — циклично внутри
  // текущего 100-юнит диапазона. На точных кратных (200/300/…) — полный.
  const barWidth = isPayback
    ? Math.min(paybackPercent, 100)
    : (() => {
        const remainder = paybackPercent % 100;
        return remainder === 0 ? 100 : remainder;
      })();

  // Цвета — те же 3 зоны, что в оригинальной механике.
  const barColor = isPayback
    ? paybackPercent < 50
      ? "bg-accent-red"
      : "bg-accent-orange"
    : "bg-accent-green";
  const barGlow = !isPayback ? "shadow-[0_0_8px_rgba(48,209,88,0.4)]" : "";

  // Диапазон ROI для фазы 2 (например «200–300%»).
  const roiMultiple = Math.floor(paybackPercent / 100);
  const rangeStart = roiMultiple * 100;
  const rangeEnd = (roiMultiple + 1) * 100;

  return (
    <div className="mt-3 pt-2.5 border-t border-glass-subtle">
      <div className="space-y-1.5">
        {/* Бар + % */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", barColor, barGlow)}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span
            className={cn(
              "text-xs font-medium shrink-0 tabular-nums",
              isPayback ? "text-white/60" : "text-accent-green"
            )}
          >
            {Math.round(paybackPercent)}%
          </span>
        </div>

        {/* Подпись: «Осталось» / «Заработано» + (диапазон в фазе 2) */}
        <div className="flex items-center justify-between">
          {isPayback ? (
            <p className="text-xs text-white/40">
              Осталось: {(totalInvested - revenue).toLocaleString("ru-RU")} ₽
            </p>
          ) : (
            <p className="text-xs text-accent-green">
              Заработано: +{profit.toLocaleString("ru-RU")} ₽
            </p>
          )}
          {!isPayback && (
            <span className="text-2xs text-white/20">
              {rangeStart}–{rangeEnd}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex rounded-2xl overflow-hidden bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card">
      {/* Photo */}
      <div className="w-[100px] sm:w-[130px] aspect-[4/5] flex-shrink-0 bg-black/40" />
      {/* Content */}
      <div className="flex-1 p-3 sm:p-4 flex flex-col min-w-0">
        <Skeleton className="h-4 w-full max-w-[180px] mb-1 rounded" />
        <Skeleton className="h-4 w-3/4 max-w-[140px] mb-2.5 rounded" />
        <div className="flex items-center gap-2 mb-2.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-14 rounded" />
        </div>
        <Skeleton className="h-4 w-24 mb-2.5 rounded" />
        <div className="flex gap-1">
          <Skeleton className="h-6 w-14 rounded-lg" />
          <Skeleton className="h-6 w-14 rounded-lg" />
          <Skeleton className="h-6 w-14 rounded-lg" />
        </div>
        <div className="mt-auto pt-2.5 flex items-center justify-between">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
      </div>
    </div>
  );
}

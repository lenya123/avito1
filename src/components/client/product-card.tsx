"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui";
import { calculatePriceBreakdown, formatPrice } from "@/utils/pricing";
import { sortSizes } from "@/utils/sizes";

export interface ProductData {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  drop_price: number;
  purchase_price: number;
  recommended_price?: number | null;
  photo_urls?: string[] | null;
  photo_main_index?: number | null;
  measurements?: unknown;
  is_premium?: boolean;
  is_active?: boolean;
  is_in_stock?: boolean;
  expected_arrival_date?: string | null;
  created_at?: string | null;
  sizes?: Array<{
    id: string;
    size: string;
    current_quantity: number;
    reserved_quantity: number;
  }>;
  isFavorite?: boolean;
  isNotificationEnabled?: boolean;
  availableSizes?: string[];
}

export interface ProductCardProps {
  product: ProductData;
  onFavoriteToggle?: (productId: string, isFavorite: boolean) => void;
  onNotifyClick?: (productId: string) => void;
  onOrderClick?: (productId: string) => void;
  onClick?: (productId: string) => void;
  userLevel?: number;
  isFirstOrder?: boolean;
  className?: string;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

export function ProductCard({
  product,
  onFavoriteToggle,
  onNotifyClick,
  onOrderClick,
  onClick,
  userLevel = 0,
  isFirstOrder = false,
  className,
}: ProductCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(product.isFavorite || false);
  const [isNotified, setIsNotified] = useState(product.isNotificationEnabled || false);

  const allSizes = product.sizes?.map((s) => s.size) || [];
  const availableSizes = product.availableSizes || [];
  const sortedSizes = sortSizes(Array.from(new Set(allSizes)));

  // Определяем статус товара
  // is_in_stock = false → "В пути" (ждём поставку)
  // is_in_stock = true + есть размеры + нет доступных → "Продано" (раскупили)
  // is_in_stock = true + нет размеров вообще → "В наличии" (товар без размерной сетки)
  // is_in_stock = true + есть доступные размеры → "В наличии"
  const hasSizes = allSizes.length > 0;
  const isSoldOut = product.is_in_stock && hasSizes && availableSizes.length === 0;
  const isInTransit = !product.is_in_stock;
  const isAvailable = product.is_in_stock && (!hasSizes || availableSizes.length > 0);

  const mainPhotoUrl = product.photo_urls?.[product.photo_main_index || 0];

  // Расчёт цены с учётом уровня и скидки первого заказа
  const levelDiscounts = [0, 3, 6, 10];
  const discountPercent = levelDiscounts[userLevel] || 0;

  const pricing = useMemo(() => {
    return calculatePriceBreakdown({
      dropPrice: product.drop_price,
      discountPercent,
      isFirstOrder,
    });
  }, [product.drop_price, discountPercent, isFirstOrder]);

  const originalPrice = pricing.basePrice;
  const discountedPrice = pricing.finalPrice;

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      const newState = !isFavorite;
      setIsFavorite(newState);
      await onFavoriteToggle?.(product.id, newState);
    } catch {
      setIsFavorite(!isFavorite);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotifyClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !isNotified;
    setIsNotified(newState);
    try {
      await onNotifyClick?.(product.id);
    } catch {
      setIsNotified(!newState);
    }
  };

  const handleOrderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOrderClick?.(product.id);
  };

  return (
    <div
      onClick={() => onClick?.(product.id)}
      className={cn(
        "group relative flex rounded-2xl overflow-hidden cursor-pointer",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        "hover:from-white/[0.10] hover:to-white/[0.06] hover:border-glass-active",
        "active:scale-[0.98]",
        "transition-all duration-150",
        "touch-action-manipulation select-none",
        className
      )}
      style={{
        WebkitTapHighlightColor: "transparent",
        contain: "layout paint",
      }}
    >
      {/* Image left side */}
      <div className="relative w-[130px] sm:w-[150px] aspect-[4/5] flex-shrink-0 bg-black/40 overflow-hidden">
        {mainPhotoUrl ? (
          <Image
            src={mainPhotoUrl}
            alt={product.name}
            fill
            loading="eager"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="140px"
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

      {/* Favorite button - glass style */}
      <button
        onClick={handleFavoriteClick}
        disabled={isLoading}
        className={cn(
          "absolute top-2.5 right-2.5 z-10",
          "w-9 h-9 flex items-center justify-center",
          "rounded-full",
          "bg-[rgba(0,0,0,0.6)] border border-glass-minimal",
          "shadow-card",
          "transition-all duration-200",
          "hover:bg-[rgba(0,0,0,0.75)] hover:border-white/20",
          "active:scale-90",
          "focus:outline-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-full"
        )}
        aria-label={isFavorite ? "Удалить из избранного" : "Добавить в избранное"}
      >
        <svg
          className={cn(
            "w-[18px] h-[18px] transition-all duration-200",
            isFavorite ? "fill-accent-red text-accent-red scale-110" : "fill-none text-white/80"
          )}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      </button>

      {/* Content right side */}
      <div className="flex-1 p-3 sm:p-4 flex flex-col min-w-0">
        {/* Brand */}
        {product.brand && (
          <p className="text-xs sm:text-xs text-white/40 uppercase tracking-wider font-medium mb-1">
            {product.brand}
          </p>
        )}

        {/* Name */}
        <h3 className="text-sm sm:text-base font-medium text-white line-clamp-2 mb-2 leading-snug">
          {product.name}
        </h3>

        {/* Status row - Premium/Standard + Stock status */}
        <div className="flex items-center gap-2 mb-3">
          {/* Premium or Standard badge */}
          <div
            className={cn(
              "inline-flex items-center px-2.5 py-1 rounded-full",
              "bg-[rgba(50,50,50,0.9)]",
              "border border-glass-active",
              product.is_premium
                ? "shadow-[0_2px_10px_rgba(0,0,0,0.25),0_0_12px_rgba(255,159,10,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]"
                : "shadow-[0_2px_10px_rgba(0,0,0,0.2),0_0_10px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.18)]"
            )}
          >
            <span
              className={cn(
                "text-2xs font-semibold uppercase tracking-wide",
                product.is_premium ? "text-accent-orange" : "text-white/80"
              )}
            >
              {product.is_premium ? "PREMIUM" : "STANDARD"}
            </span>
          </div>

          {/* Stock status - text only with indicator */}
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
              {isSoldOut && "Продано"}
            </span>
          </div>

          {/* Arrival date */}
          {isInTransit && product.expected_arrival_date && (
            <span className="text-xs text-white/40">
              {formatDate(product.expected_arrival_date)}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-white text-base sm:text-base font-bold leading-none">
            {formatPrice(Math.round(discountedPrice))}
          </span>
          {pricing.totalDiscount > 0 && (
            <>
              <span className="text-white/40 line-through text-xs leading-none">
                {formatPrice(originalPrice)}
              </span>
              {pricing.levelDiscountPercent > 0 && (
                <span className="text-xs font-semibold text-white leading-none">
                  −{pricing.levelDiscountPercent}%
                </span>
              )}
              {pricing.firstOrderDiscount > 0 && (
                <span className="text-xs font-semibold text-accent-orange leading-none">
                  −500 ₽
                </span>
              )}
            </>
          )}
        </div>

        {/* Sizes */}
        {hasSizes ? (
          <div className="flex flex-wrap items-center gap-1">
            {sortedSizes.slice(0, 6).map((size) => {
              const isSizeAvailable = availableSizes.includes(size);
              return (
                <span
                  key={size}
                  className={cn(
                    "h-6 min-w-[28px] px-1.5 flex items-center justify-center text-xs font-medium rounded-lg",
                    "transition-all duration-200",
                    isSizeAvailable
                      ? "border border-glass-active bg-[rgba(60,60,60,0.9)] text-white/80 shadow-card"
                      : "border border-white/[0.08] bg-transparent text-white/20"
                  )}
                >
                  {size}
                </span>
              );
            })}
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

        {/* Action button - full width at bottom */}
        <div className="mt-auto pt-3">
          {isAvailable ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOrderClick}
              className="w-full py-2.5 rounded-xl"
            >
              Оформить заказ
            </Button>
          ) : (
            <Button
              variant={isNotified ? "warning" : "secondary"}
              size="sm"
              onClick={handleNotifyClick}
              className="w-full py-2.5"
              leftIcon={
                <svg
                  className={cn(
                    "w-4 h-4 transition-colors",
                    isNotified ? "fill-white" : "fill-none"
                  )}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              }
            >
              {isNotified ? "Уведомление включено" : "Уведомить о поступлении"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

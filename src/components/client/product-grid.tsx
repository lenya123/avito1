"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { ProductCard, type ProductCardProps } from "./product-card";
import { Empty, Skeleton } from "@/components/ui";

type ProductWithExtras = ProductCardProps["product"];

export interface ProductGridProps {
  products: ProductWithExtras[];
  isLoading?: boolean;
  userLevel?: number;
  isFirstOrder?: boolean;
  onFavoriteToggle?: (productId: string, isFavorite: boolean) => void;
  onNotifyClick?: (productId: string) => void;
  onOrderClick?: (productId: string) => void;
  onProductClick?: (productId: string) => void;
  className?: string;
}

// Базовая задержка (как на странице заказов)
const BASE_DELAY = 0.2;

function ProductCardSkeleton() {
  return (
    <div className="flex rounded-2xl overflow-hidden bg-gradient-to-b from-white/[0.08] to-white/[0.04] backdrop-blur-xl border border-glass shadow-card">
      {/* Image */}
      <Skeleton
        className="w-[130px] sm:w-[150px] aspect-[4/5] flex-shrink-0"
        variant="rectangular"
      />
      {/* Content */}
      <div className="flex-1 p-3 sm:p-4 flex flex-col min-w-0">
        {/* Brand */}
        <Skeleton className="h-2.5 w-14 mb-1 rounded" />
        {/* Name */}
        <Skeleton className="h-3.5 w-full mb-1 rounded" />
        <Skeleton className="h-3.5 w-3/4 mb-2 rounded" />
        {/* Status row */}
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-6 w-[72px] rounded-full" />
          <Skeleton className="h-3 w-14 rounded" />
        </div>
        {/* Price */}
        <Skeleton className="h-4 w-20 rounded mb-3" />
        {/* Sizes */}
        <div className="flex gap-1">
          <Skeleton className="h-6 w-7 rounded-md" />
          <Skeleton className="h-6 w-7 rounded-md" />
          <Skeleton className="h-6 w-7 rounded-md" />
          <Skeleton className="h-6 w-7 rounded-md" />
          <Skeleton className="h-6 w-7 rounded-md" />
        </div>
        {/* Button */}
        <div className="mt-auto pt-3">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({
  products,
  isLoading = false,
  userLevel = 0,
  isFirstOrder = false,
  onFavoriteToggle,
  onNotifyClick,
  onOrderClick,
  onProductClick,
  className,
}: ProductGridProps) {
  // Скелетоны со stagger-анимацией
  if (isLoading) {
    return (
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4", className)}>
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: BASE_DELAY + i * 0.03 }}
          >
            <ProductCardSkeleton />
          </motion.div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Empty
          icon="🛍️"
          title="Товары не найдены"
          description="Попробуйте изменить фильтры или поисковый запрос"
          className={className}
        />
      </motion.div>
    );
  }

  // Карточки со stagger-анимацией — ВСЕГДА анимируем (как на странице заказов)
  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4", className)}>
      {products.map((product, index) => (
        <motion.div
          key={product.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: BASE_DELAY + index * 0.03 }}
        >
          <ProductCard
            product={product}
            userLevel={userLevel}
            isFirstOrder={isFirstOrder}
            onFavoriteToggle={onFavoriteToggle}
            onNotifyClick={onNotifyClick}
            onOrderClick={onOrderClick}
            onClick={onProductClick}
          />
        </motion.div>
      ))}
    </div>
  );
}

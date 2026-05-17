"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui";
import { cn } from "@/utils/cn";
import type { ProductListItem } from "@/hooks/use-owner-products";

interface ProductCardProps {
  product: ProductListItem;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const lowStock = product.totalStock > 0 && product.totalStock <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.005 }}
    >
      <Link
        href={`/owner/products/${product.id}`}
        className="relative overflow-hidden block p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card hover:bg-white/[0.06] transition-colors"
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="flex gap-4">
          {/* Photo */}
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass flex-shrink-0">
            {product.photoUrl ? (
              <img
                src={product.photoUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-white truncate">{product.name}</h3>
              {product.isPremium && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-gradient-to-b from-accent-purple/30 to-accent-purple/15 border border-accent-purple/20 text-accent-purple backdrop-blur-xl">
                  Premium
                </span>
              )}
              {!product.isActive && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-white/60">
                  Неактивен
                </span>
              )}
            </div>

            {product.brand && <p className="text-sm text-white/60 mb-2">{product.brand}</p>}

            {/* Prices */}
            <div className="flex items-center gap-3 text-sm mb-2">
              <span className="text-white/40">
                Закуп: {product.purchasePrice.toLocaleString("ru-RU")} ₽
              </span>
              <span className="text-white font-medium">
                Дроп: {product.dropPrice.toLocaleString("ru-RU")} ₽
              </span>
            </div>

            {/* Sizes */}
            <div className="flex flex-wrap gap-1">
              {product.sizes.slice(0, 6).map((size) => (
                <span
                  key={size.size}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-full backdrop-blur-xl",
                    size.current === 0
                      ? "bg-red-500/20 text-accent-red border border-accent-red/20"
                      : size.current <= 2
                        ? "bg-yellow-500/20 text-accent-orange border border-accent-orange/20"
                        : "bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-white/60"
                  )}
                >
                  {size.size}: {size.current}/{size.initial}
                </span>
              ))}
              {product.sizes.length > 6 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-white/60">
                  +{product.sizes.length - 6}
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="text-right flex-shrink-0">
            <div className="mb-2">
              <p
                className={cn(
                  "text-lg font-semibold",
                  lowStock ? "text-accent-orange" : "text-white"
                )}
              >
                {product.totalStock}
              </p>
              <p className="text-xs text-white/40">в наличии</p>
            </div>
            <div>
              <p className="text-sm text-accent-green">{product.sales.sold} продано</p>
              <p className="text-xs text-white/40">
                {product.sales.revenue.toLocaleString("ru-RU")} ₽
              </p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card">
      <div className="flex gap-4">
        <Skeleton className="w-20 h-20 rounded-lg flex-shrink-0" />
        <div className="flex-1">
          <Skeleton className="h-5 w-48 mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-4 w-40 mb-2" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
        <div className="text-right">
          <Skeleton className="h-6 w-8 mb-1" />
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

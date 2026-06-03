"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Card, Badge, Skeleton } from "@/components/ui";

interface TopProductsSmartProps {
  products: Array<{
    id: string;
    name: string;
    photo: string | null;
    orders: number;
    revenue: number;
    profitMargin: number;
    returnRate: number;
    trend: "up" | "down" | "flat";
    lastSaleDate: string | null;
  }>;
}

export function TopProductsSmart({ products }: TopProductsSmartProps) {
  if (products.length === 0) {
    return (
      <Card>
        <div className="p-4">
          <h3 className="text-base font-medium text-white mb-3">
            Топ товаров <span className="text-sm text-white/30 font-normal">(30 дн.)</span>
          </h3>
          <p className="text-sm text-white/40 py-6 text-center">Нет данных</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-medium text-white">
            Топ товаров <span className="text-sm text-white/30 font-normal">(30 дн.)</span>
          </h3>
          <Link
            href="/owner/products"
            className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            Все →
          </Link>
        </div>

        <div className="space-y-2">
          {products.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                href={`/owner/products/${product.id}`}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
              >
                {/* Rank */}
                <span className="text-sm text-white/40 w-6">{index + 1}</span>

                {/* Thumbnail */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass overflow-hidden shrink-0">
                  {product.photo ? (
                    <img
                      src={product.photo}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/40">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Name + orders */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{product.name}</p>
                  <p className="text-xs text-white/60">{product.orders} заказов</p>
                </div>

                {/* Right side: trend + margin + return badge */}
                <div className="flex items-center gap-2 shrink-0">
                  {product.trend === "up" && (
                    <svg
                      className="w-3.5 h-3.5 text-accent-green"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                      />
                    </svg>
                  )}
                  {product.trend === "down" && (
                    <svg
                      className="w-3.5 h-3.5 text-accent-red"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  )}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      product.profitMargin >= 20 ? "text-accent-green" : "text-accent-red"
                    )}
                  >
                    {product.profitMargin}%
                  </span>
                  {product.returnRate > 15 && (
                    <Badge variant="error" size="sm">
                      ↩ {product.returnRate}%
                    </Badge>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function TopProductsSmartSkeleton() {
  return (
    <Card>
      <div className="p-4 animate-pulse">
        <div className="flex justify-between mb-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="w-6 h-4" />
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { sortSizes } from "@/utils/sizes";
import type { CatalogProduct } from "./types";

export interface CatalogProductCardProps {
  product: CatalogProduct;
  onClick: (productId: string) => void;
  className?: string;
}

function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function formatArrival(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function CatalogProductCard({ product, onClick, className }: CatalogProductCardProps) {
  const photo = product.photo_urls[product.photo_main_index] ?? product.photo_urls[0] ?? null;

  const allSizes = product.sizes.map((s) => s.size);
  const sortedSizes = sortSizes(Array.from(new Set(allSizes)));
  const sizeLine = sortedSizes.join(" · ");

  const totalAvailable = product.sizes.reduce((acc, s) => acc + s.available, 0);
  const isInTransit = !product.is_in_stock;
  const isSoldOut = product.is_in_stock && totalAvailable === 0;
  const isAvailable = product.is_in_stock && totalAvailable > 0;

  return (
    <motion.button
      type="button"
      onClick={() => onClick(product.id)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "group flex w-full gap-4 rounded-2xl border border-black/5 bg-white p-3 text-left",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-32 sm:w-32">
        {photo ? (
          <Image
            src={photo}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 112px, 128px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-gray-300">
            🖼
          </div>
        )}

        {isAvailable && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            В наличии
          </span>
        )}
        {isInTransit && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            В пути
            {product.expected_arrival_date
              ? ` · ${formatArrival(product.expected_arrival_date)}`
              : ""}
          </span>
        )}
        {isSoldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-gray-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            Продано
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between gap-2 py-0.5">
        <div>
          <h3 className="line-clamp-2 text-base font-semibold text-gray-900 sm:text-lg">
            {product.name}
          </h3>
          {product.category && <p className="mt-0.5 text-xs text-gray-500">{product.category}</p>}
        </div>

        {sortedSizes.length > 0 && (
          <p className="text-xs text-gray-600 sm:text-sm">
            <span className="text-gray-400">Размеры:</span> {sizeLine}
          </p>
        )}

        <div className="flex items-baseline gap-3">
          <span className="text-base font-bold text-gray-900 sm:text-lg">
            {formatRub(product.drop_price)}
          </span>
          {product.recommended_price !== null && product.recommended_price > 0 && (
            <span className="text-xs text-gray-500 sm:text-sm">
              Авито:{" "}
              <span className="font-medium text-gray-700">
                {formatRub(product.recommended_price)}
              </span>
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

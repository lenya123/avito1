"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { Button, Input } from "@/components/ui";
import { Toggle } from "@/components/ui/toggle";

export interface FilterState {
  search: string;
  category: string;
  brand: string;
  size: string;
  inStock: boolean;
  favorites: boolean;
  premiumOnly: boolean;
  sort: "newest" | "oldest" | "price_asc" | "price_desc";
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface ProductFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  categories: FilterOption[];
  brands: FilterOption[];
  sizes: FilterOption[];
  totalProducts?: number;
  isPremium?: boolean;
  className?: string;
  isLoading?: boolean;
}

type SortValue = "newest" | "oldest" | "price_asc" | "price_desc";

export function ProductFilters({
  filters,
  onChange,
  categories,
  brands,
  sizes,
  totalProducts,
  isPremium = false,
  className,
  isLoading = false,
}: ProductFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Сбрасываем зависимые фильтры при изменении родительского
  const handleChange = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      const newFilters = { ...filters, [key]: value };
      // Зависимые фильтры (бренд, размер) сбрасываются автоматически через useEffect ниже,
      // если они становятся недоступными при изменении родительского фильтра
      onChange(newFilters);
    },
    [filters, onChange]
  );

  // Автоматически сбрасываем бренд, если он недоступен для выбранной категории
  useEffect(() => {
    if (filters.brand && brands.length > 0) {
      const isBrandAvailable = brands.some((b) => b.value === filters.brand);
      if (!isBrandAvailable) {
        onChange({ ...filters, brand: "" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands]);

  // Автоматически сбрасываем размер, если он недоступен
  useEffect(() => {
    if (filters.size && sizes.length > 0) {
      const isSizeAvailable = sizes.some((s) => s.value === filters.size);
      if (!isSizeAvailable) {
        onChange({ ...filters, size: "" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes]);

  const activeFiltersCount = [
    filters.category,
    filters.brand,
    filters.size,
    filters.inStock,
    filters.favorites,
    filters.premiumOnly,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onChange({
      search: "",
      category: "",
      brand: "",
      size: "",
      inStock: false,
      favorites: false,
      premiumOnly: false,
      sort: "newest",
    });
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search and toggle */}
      <div className="flex gap-2">
        <Input
          placeholder="Поиск по названию или бренду..."
          value={filters.search}
          onChange={(e) => handleChange("search", e.target.value)}
          leftIcon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          }
          className="flex-1"
        />
        <Button
          variant={isExpanded ? "primary" : "secondary"}
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label="Фильтры"
          className={cn(
            "relative p-2.5",
            !isExpanded && "bg-white/10 text-white border border-glass hover:bg-white/15"
          )}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-blue text-white text-xs font-bold rounded-full flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </div>

      {/* Sort buttons (always visible) */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {/* Дата — переключение newest/oldest */}
        <button
          onClick={() => {
            const newSort: SortValue = filters.sort === "newest" ? "oldest" : "newest";
            handleChange("sort", newSort);
          }}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex items-center gap-1.5",
            "backdrop-blur-xl border transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
            filters.sort === "newest" || filters.sort === "oldest"
              ? [
                  // Активный - с цветным градиентом и glow
                  "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                  "text-white border-glass-strong",
                  "shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_rgba(94,92,230,0.15),inset_0_1px_0_rgba(255,255,255,0.2)]",
                ]
              : [
                  // Неактивный
                  "bg-white/[0.06] text-white/60 border-glass-subtle",
                  "shadow-glass-inset",
                  "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                ]
          )}
        >
          Дата выхода
          {filters.sort === "newest" ? (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          ) : filters.sort === "oldest" ? (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          ) : null}
        </button>

        {/* Цена — переключение price_asc/price_desc */}
        <button
          onClick={() => {
            const newSort: SortValue = filters.sort === "price_asc" ? "price_desc" : "price_asc";
            handleChange("sort", newSort);
          }}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex items-center gap-1.5",
            "backdrop-blur-xl border transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
            filters.sort === "price_asc" || filters.sort === "price_desc"
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
          Цена
          {filters.sort === "price_asc" ? (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          ) : filters.sort === "price_desc" ? (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          ) : null}
        </button>

        {/* Избранное */}
        <button
          onClick={() => handleChange("favorites", !filters.favorites)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex items-center gap-1.5",
            "backdrop-blur-xl border transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
            filters.favorites
              ? [
                  // Активный - с розовым акцентом для сердечка
                  "bg-gradient-to-br from-white/[0.18] via-white/[0.12] to-[rgba(255,69,58,0.08)]",
                  "text-white border-glass-strong",
                  "shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_rgba(255,69,58,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]",
                ]
              : [
                  "bg-white/[0.06] text-white/60 border-glass-subtle",
                  "shadow-glass-inset",
                  "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                ]
          )}
        >
          <svg
            className={cn(
              "w-4 h-4 transition-all duration-200",
              filters.favorites ? "fill-accent-red text-accent-red scale-110" : "fill-none"
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
          Избранное
        </button>
      </div>

      {/* Expanded filters */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "p-4 rounded-2xl space-y-4",
                "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                "border border-glass",
                "shadow-card"
              )}
            >
              {/* Total products info */}
              {totalProducts !== undefined && (
                <p className="text-sm text-white/40">
                  Найдено товаров:{" "}
                  <span className="text-white/80 font-medium">{totalProducts}</span>
                </p>
              )}

              {/* Category */}
              {categories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Категория</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleChange("category", "")}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                        "shadow-glass-inset",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                        !filters.category
                          ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                          : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                      )}
                    >
                      Все
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => handleChange("category", cat.value)}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          filters.category === cat.value
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                        )}
                      >
                        {cat.value}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Brand */}
              {brands.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">
                    Бренд
                    {filters.category && (
                      <span className="text-white/40 font-normal ml-1">
                        (в категории «{filters.category}»)
                      </span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleChange("brand", "")}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                        "shadow-glass-inset",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                        !filters.brand
                          ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                          : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                      )}
                    >
                      Все
                    </button>
                    {brands.map((brand) => (
                      <button
                        key={brand.value}
                        onClick={() => handleChange("brand", brand.value)}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          filters.brand === brand.value
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                        )}
                      >
                        {brand.value}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size */}
              {sizes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">
                    Размер
                    {(filters.category || filters.brand) && (
                      <span className="text-white/40 font-normal ml-1">(доступные)</span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleChange("size", "")}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                        "shadow-glass-inset",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                        !filters.size
                          ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                          : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                      )}
                    >
                      Все
                    </button>
                    {sizes.map((size) => (
                      <button
                        key={size.value}
                        onClick={() => handleChange("size", size.value)}
                        className={cn(
                          "min-w-[40px] px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          filters.size === size.value
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                        )}
                      >
                        {size.value}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-center gap-2 text-white/40 text-sm">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                  Обновление фильтров...
                </div>
              )}

              {/* Premium-only toggles */}
              {isPremium && (
                <div className="space-y-3">
                  <Toggle
                    label="Только в наличии"
                    checked={filters.inStock}
                    onChange={(checked) => handleChange("inStock", checked)}
                    size="sm"
                  />
                  <Toggle
                    label="Только Premium"
                    checked={filters.premiumOnly}
                    onChange={(checked) => handleChange("premiumOnly", checked)}
                    size="sm"
                  />
                </div>
              )}

              {/* Clear filters */}
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-white/60">
                  Сбросить фильтры
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

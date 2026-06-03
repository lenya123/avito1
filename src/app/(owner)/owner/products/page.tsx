"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useOwnerProducts, type ProductsFilters } from "@/hooks/use-owner-products";
import { ErrorState, Button, Input, Empty, EmptyPresets, Pagination } from "@/components/ui";
import { cn } from "@/utils/cn";
import { ProductCard, ProductCardSkeleton } from "@/components/owner/products";
import { useDebounce } from "@/hooks/use-debounce";

export default function OwnerProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const filters = useMemo<ProductsFilters>(
    () => ({
      page: Number(searchParams.get("page")) || 1,
      limit: 20,
      status: (searchParams.get("status") as ProductsFilters["status"]) || "all",
      stock: (searchParams.get("stock") as ProductsFilters["stock"]) || "all",
      loss: (searchParams.get("loss") as ProductsFilters["loss"]) || "all",
      premium: (searchParams.get("premium") as ProductsFilters["premium"]) || "all",
      sort: (searchParams.get("sort") as ProductsFilters["sort"]) || "created_at",
      order: (searchParams.get("order") as ProductsFilters["order"]) || "desc",
      category: searchParams.get("cat") || undefined,
      size: searchParams.get("size") || undefined,
      sellerId: searchParams.get("sellerId") || "me",
    }),
    [searchParams]
  );

  const setFilters = useCallback(
    (next: ProductsFilters) => {
      const params = new URLSearchParams();
      if (next.page && next.page > 1) params.set("page", String(next.page));
      if (next.status && next.status !== "all") params.set("status", next.status);
      if (next.stock && next.stock !== "all") params.set("stock", next.stock);
      if (next.loss && next.loss !== "all") params.set("loss", next.loss);
      if (next.premium && next.premium !== "all") params.set("premium", next.premium);
      if (next.sort && next.sort !== "created_at") params.set("sort", next.sort);
      if (next.order && next.order !== "desc") params.set("order", next.order);
      if (next.category) params.set("cat", next.category);
      if (next.size) params.set("size", next.size);
      if (next.search) params.set("q", next.search);
      if (next.sellerId && next.sellerId !== "me") params.set("sellerId", next.sellerId);
      const qs = params.toString();
      router.replace(`/owner/products${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router]
  );

  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data, isLoading, error, refetch } = useOwnerProducts({
    ...filters,
    search: debouncedSearch || undefined,
  });

  const handleFilterChange = (key: keyof ProductsFilters, value: string) => {
    setFilters({ ...filters, [key]: value, page: 1 });
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить список товаров"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Товары</h1>
          <p className="text-white/60 mt-1">Каталог товаров бизнеса.</p>
        </div>
        <Link href="/owner/products/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Добавить товар
          </Button>
        </Link>
      </motion.div>

      {/* Summary — В пути → В наличии */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3"
        >
          {/* В пути */}
          <div className="flex-1 p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-accent-orange">
                <path
                  d="M16 3H1V16H16V3Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(2, 2) scale(0.85)"
                />
                <path
                  d="M16 8H20L23 11V16H16V8Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(2, 2) scale(0.85)"
                />
                <circle cx="7.5" cy="18.5" r="2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="18.5" cy="18.5" r="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <p className="text-sm font-medium text-accent-orange">В пути</p>
            </div>
            <p className="text-3xl font-bold text-accent-orange">{data.summary.inTransit}</p>
          </div>

          {/* Стрелка */}
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-white/20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>

          {/* В наличии */}
          <div className="flex-1 p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <svg
                className="w-4 h-4 text-accent-blue"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-medium text-accent-blue">В наличии</p>
            </div>
            <p className="text-3xl font-bold text-accent-blue">{data.summary.inStock}</p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        {/* Search + filter toggle */}
        <div className="flex gap-2">
          <Input
            placeholder="Поиск по названию..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
            variant={isFiltersExpanded ? "primary" : "secondary"}
            size="sm"
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            aria-label="Фильтры"
            className={cn(
              "relative p-2.5",
              !isFiltersExpanded && "bg-white/10 text-white border border-glass hover:bg-white/15"
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
            {(() => {
              const count = [
                filters.status && filters.status !== "all",
                filters.stock && filters.stock !== "all",
                filters.loss && filters.loss !== "all",
                filters.premium && filters.premium !== "all",
                filters.category,
                filters.size,
              ].filter(Boolean).length;
              return count > 0 ? (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-blue text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {count}
                </span>
              ) : null;
            })()}
          </Button>
        </div>

        {/* Sort buttons (always visible) */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {/* По дате */}
          <button
            onClick={() => {
              if (filters.sort === "created_at") {
                handleFilterChange("order", filters.order === "desc" ? "asc" : "desc");
              } else {
                setFilters({ ...filters, sort: "created_at", order: "desc", page: 1 });
              }
            }}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex items-center gap-1.5",
              "backdrop-blur-xl border transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
              (filters.sort || "created_at") === "created_at"
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
            По дате
            {(filters.sort || "created_at") === "created_at" && (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={filters.order === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
                />
              </svg>
            )}
          </button>

          {/* По цене */}
          <button
            onClick={() => {
              if (filters.sort === "price") {
                handleFilterChange("order", filters.order === "desc" ? "asc" : "desc");
              } else {
                setFilters({ ...filters, sort: "price", order: "desc", page: 1 });
              }
            }}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex items-center gap-1.5",
              "backdrop-blur-xl border transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
              filters.sort === "price"
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
            {filters.sort === "price" && (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={filters.order === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
                />
              </svg>
            )}
          </button>

          {/* По названию */}
          <button
            onClick={() => {
              if (filters.sort === "name") {
                handleFilterChange("order", filters.order === "desc" ? "asc" : "desc");
              } else {
                setFilters({ ...filters, sort: "name", order: "asc", page: 1 });
              }
            }}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex items-center gap-1.5",
              "backdrop-blur-xl border transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
              filters.sort === "name"
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
            Название
            {filters.sort === "name" && (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={filters.order === "asc" ? "M19 9l-7 7-7-7" : "M5 15l7-7 7 7"}
                />
              </svg>
            )}
          </button>
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {isFiltersExpanded && (
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
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Статус</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "Все" },
                      { value: "active", label: "Активные" },
                      { value: "inactive", label: "Неактивные" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleFilterChange("status", option.value)}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          (filters.status || "all") === option.value
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stock */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Наличие</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "Все" },
                      { value: "in_stock", label: "В наличии" },
                      { value: "in_transit", label: "В пути" },
                      { value: "low_stock", label: "Заканчивается" },
                      { value: "out_of_stock", label: "Распродан" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleFilterChange("stock", option.value)}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          (filters.stock || "all") === option.value
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Недостача */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Недостача</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "Все" },
                      { value: "with_loss", label: "С недостачей" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleFilterChange("loss", option.value)}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          (filters.loss || "all") === option.value
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Premium */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Тип</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "Все" },
                      { value: "yes", label: "Premium" },
                      { value: "no", label: "Обычные" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleFilterChange("premium", option.value)}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          (filters.premium || "all") === option.value
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category */}
                {data?.categories && data.categories.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">
                      Категория
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleFilterChange("category", "")}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          !filters.category
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                        )}
                      >
                        Все
                      </button>
                      {data.categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => handleFilterChange("category", cat)}
                          className={cn(
                            "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                            "shadow-glass-inset",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                            filters.category === cat
                              ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                              : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Size */}
                {data?.sizes && data.sizes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Размер</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleFilterChange("size", "")}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                          "shadow-glass-inset",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                          !filters.size
                            ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                            : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                        )}
                      >
                        Все
                      </button>
                      {data.sizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => handleFilterChange("size", size)}
                          className={cn(
                            "min-w-[40px] px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                            "shadow-glass-inset",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                            filters.size === size
                              ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                              : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clear filters */}
                {(() => {
                  const hasActiveFilters = [
                    filters.status && filters.status !== "all",
                    filters.stock && filters.stock !== "all",
                    filters.loss && filters.loss !== "all",
                    filters.premium && filters.premium !== "all",
                    filters.category,
                    filters.size,
                  ].some(Boolean);
                  return hasActiveFilters ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFilters({
                          ...filters,
                          status: "all",
                          stock: "all",
                          loss: "all",
                          premium: "all",
                          category: undefined,
                          size: undefined,
                          page: 1,
                        });
                      }}
                      className="text-white/60"
                    >
                      Сбросить фильтры
                    </Button>
                  ) : null;
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Results count */}
      {data && <p className="text-sm text-white/60">Найдено: {data.pagination.total} товаров</p>}

      {/* Products grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => <ProductCardSkeleton key={i} />)
        ) : data?.products.length === 0 ? (
          <Empty
            {...EmptyPresets.products}
            action={
              <Link href="/owner/products/new">
                <Button>Добавить первый товар</Button>
              </Link>
            }
          />
        ) : (
          data?.products.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(0.05 + index * 0.02, 0.3) }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <Pagination
            page={filters.page || 1}
            totalPages={data.pagination.totalPages}
            onPageChange={(p) => setFilters({ ...filters, page: p })}
          />
        </motion.div>
      )}
    </div>
  );
}

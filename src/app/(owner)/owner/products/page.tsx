"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerProducts, type ProductsFilters } from "@/hooks/use-owner-products";
import { ErrorState, Button, Input, Empty, EmptyPresets } from "@/components/ui";
import { cn } from "@/utils/cn";
import { ProductCard, ProductCardSkeleton } from "@/components/owner/products";
import { useDebounce } from "@/hooks/use-debounce";

export default function OwnerProductsPage() {
  const [filters, setFilters] = useState<ProductsFilters>({
    page: 1,
    limit: 20,
    status: "all",
    stock: "all",
    premium: "all",
    sort: "created_at",
    order: "desc",
  });

  const [searchInput, setSearchInput] = useState("");
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
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Товары</h1>
          <p className="text-white/60 mt-1">Управление каталогом товаров</p>
        </div>
        <Link href="/owner/products/new">
          <Button>
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

      {/* Summary */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-white">{data.summary.total}</p>
            <p className="text-sm text-white/60">Всего</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-green">{data.summary.active}</p>
            <p className="text-sm text-white/60">Активных</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-blue">{data.summary.inStock}</p>
            <p className="text-sm text-white/60">В наличии</p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <Input
          placeholder="Поиск по названию, бренду..."
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
        />

        <div className="flex flex-wrap gap-2">
          {/* Status */}
          <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04]">
            {[
              { value: "all", label: "Все" },
              { value: "active", label: "Активные" },
              { value: "inactive", label: "Неактивные" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handleFilterChange("status", option.value)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors duration-200",
                  (filters.status || "all") === option.value
                    ? "bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-white/60 hover:text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Stock */}
          <select
            value={filters.stock || "all"}
            onChange={(e) => handleFilterChange("stock", e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/[0.08] border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            <option value="all">Все наличие</option>
            <option value="in_stock">В наличии</option>
            <option value="in_transit">В пути</option>
            <option value="out_of_stock">Нет в наличии</option>
          </select>

          {/* Premium */}
          <select
            value={filters.premium || "all"}
            onChange={(e) => handleFilterChange("premium", e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/[0.08] border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            <option value="all">Все типы</option>
            <option value="yes">Premium</option>
            <option value="no">Обычные</option>
          </select>

          {/* Category */}
          {data?.categories && data.categories.length > 0 && (
            <select
              value={filters.category || ""}
              onChange={(e) => handleFilterChange("category", e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg bg-white/[0.08] border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            >
              <option value="">Все категории</option>
              {data.categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}

          {/* Sort */}
          <select
            value={filters.sort || "created_at"}
            onChange={(e) => handleFilterChange("sort", e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/[0.08] border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            <option value="created_at">По дате</option>
            <option value="name">По названию</option>
            <option value="price">По цене</option>
          </select>

          <button
            onClick={() => handleFilterChange("order", filters.order === "desc" ? "asc" : "desc")}
            className="p-2 rounded-lg bg-white/[0.06] border border-glass text-white/60 hover:text-white transition-colors"
          >
            {filters.order === "desc" ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"
                />
              </svg>
            )}
          </button>
        </div>
      </motion.div>

      {/* Results count */}
      {data && <p className="text-sm text-white/60">Найдено: {data.pagination.total} товаров</p>}

      {/* Products list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
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
              transition={{ delay: 0.1 + index * 0.03 }}
            >
              <ProductCard product={product} index={index} />
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-2"
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={filters.page === 1}
            onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
          >
            Назад
          </Button>

          <span className="text-white/60 text-sm">
            {filters.page} / {data.pagination.totalPages}
          </span>

          <Button
            variant="ghost"
            size="sm"
            disabled={filters.page === data.pagination.totalPages}
            onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
          >
            Далее
          </Button>
        </motion.div>
      )}
    </div>
  );
}

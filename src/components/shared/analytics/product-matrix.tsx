"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { Modal } from "@/components/ui";
import type { OwnerAnalyticsResponse } from "@/hooks/use-owner-analytics";

type Product = OwnerAnalyticsResponse["productMatrix"][number];
type Category = OwnerAnalyticsResponse["categories"][number];

interface ProductMatrixProps {
  products: Product[];
  categories: Category[];
}

type ViewMode = "profit" | "revenue" | "orders" | "loss" | "category";

const TOP_LIMIT = 5;

const VIEW_TABS: Array<{ key: ViewMode; label: string }> = [
  { key: "profit", label: "По прибыли" },
  { key: "revenue", label: "По выручке" },
  { key: "orders", label: "По заказам" },
  { key: "loss", label: "По недостаче" },
  { key: "category", label: "По категории" },
];

function sortProducts(products: Product[], mode: ViewMode): Product[] {
  if (mode === "loss") return [...products].sort((a, b) => b.lossUnits - a.lossUnits);
  const key = mode === "revenue" ? "revenue" : mode === "orders" ? "orders" : "profit";
  return [...products].sort((a, b) => (b[key] as number) - (a[key] as number));
}

function TurnoverBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-white/40">—</span>;
  const color =
    days < 30 ? "text-accent-green" : days < 60 ? "text-accent-orange" : "text-accent-red";
  return <span className={cn("text-xs font-medium", color)}>{days}дн</span>;
}

function TrendArrow({ trend }: { trend: number }) {
  if (trend === 0) return null;
  return (
    <span
      className={cn("text-xs font-medium", trend > 0 ? "text-accent-green" : "text-accent-red")}
    >
      {trend > 0 ? "↑" : "↓"}
      {Math.abs(trend)}%
    </span>
  );
}

function ProductRow({ product, viewMode }: { product: Product; viewMode: ViewMode }) {
  return (
    <Link
      href={`/owner/products/${product.id}`}
      className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-b from-white/[0.04] to-transparent border border-glass-subtle hover:border-glass hover:from-white/[0.06] transition-all"
    >
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/[0.08] shrink-0">
        {product.photo ? (
          <img src={product.photo} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-white/20">
            📦
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{product.name}</p>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span>{product.orders} заказов</span>
          {product.returnRate > 0 && (
            <span className={product.returnRate > 15 ? "text-accent-red" : "text-accent-orange"}>
              ↩{product.returnRate}%
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:grid grid-cols-[3rem_3.5rem_3rem] gap-x-4 shrink-0 tabular-nums text-center">
        <p className="text-xs text-white/40">ROI</p>
        <p className="text-xs text-white/40">Оборач.</p>
        <p className="text-xs text-white/40">Остаток</p>
        <p
          className={cn(
            "text-xs font-medium",
            product.roiPercent >= 100
              ? "text-accent-green"
              : product.roiPercent >= 50
                ? "text-accent-orange"
                : "text-accent-red"
          )}
        >
          {product.roiPercent}%
        </p>
        <p className="text-xs font-medium">
          <TurnoverBadge days={product.turnoverDays} />
        </p>
        <p className="text-xs font-medium text-white">{product.stockRemaining}</p>
      </div>

      <div className="text-right shrink-0 min-w-[4.5rem]">
        {viewMode === "loss" ? (
          <>
            <p className="text-sm font-medium text-accent-red">−{product.lossUnits} шт</p>
            {product.lossRub > 0 && (
              <p className="text-xs font-medium text-accent-red/70">
                −{formatPrice(Math.round(product.lossRub))}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-accent-green">
              {viewMode === "orders"
                ? `${product.orders} шт`
                : formatPrice(viewMode === "revenue" ? product.revenue : product.profit)}
            </p>
            <TrendArrow
              trend={
                viewMode === "orders"
                  ? product.trendOrders
                  : viewMode === "revenue"
                    ? product.trendRevenue
                    : product.trendProfit
              }
            />
          </>
        )}
      </div>
    </Link>
  );
}

function CategoryButton({ cat, onClick }: { cat: Category; onClick: (name: string) => void }) {
  return (
    <button
      onClick={() => onClick(cat.name)}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-b from-white/[0.04] to-transparent border border-glass-subtle hover:border-glass hover:from-white/[0.06] transition-all"
    >
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm text-white">{cat.name}</p>
        <p className="text-xs text-white/40">
          {cat.productCount} товаров · {cat.orders} заказов
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-medium text-accent-green">{formatPrice(cat.revenue)}</p>
        <p className="text-xs text-white/40">ROI {cat.roiPercent}%</p>
      </div>
      <div className="w-16 h-2 rounded-full bg-white/[0.08] overflow-hidden shrink-0">
        <div
          className="h-full rounded-full bg-accent-green"
          style={{ width: `${cat.revenueShare}%` }}
        />
      </div>
    </button>
  );
}

interface MatrixBodyProps {
  products: Product[];
  categories: Category[];
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  categoryFilter: string | null;
  setCategoryFilter: (v: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  limit: number | null; // null = unlimited
  unlimitedCategoryView?: boolean;
  showCountAndSearch?: boolean; // count badge + search input (modal only)
}

function MatrixBody({
  products,
  categories,
  viewMode,
  setViewMode,
  categoryFilter,
  setCategoryFilter,
  search,
  setSearch,
  limit,
  unlimitedCategoryView,
  showCountAndSearch,
}: MatrixBodyProps) {
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    let result = products;
    if (categoryFilter) result = result.filter((p) => p.category === categoryFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    // В разрезе «По недостаче» показываем только товары с потерями за период.
    if (viewMode === "loss") result = result.filter((p) => p.lossUnits > 0);
    return result;
  }, [products, categoryFilter, debouncedSearch, viewMode]);

  const sorted = sortProducts(filtered, viewMode);
  const visible = limit !== null ? sorted.slice(0, limit) : sorted;

  const visibleCategories = unlimitedCategoryView ? categories : categories.slice(0, 5);

  return (
    <>
      {/* Header with count + search (modal only) */}
      {showCountAndSearch && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white/60 px-3 py-1 rounded-full bg-white/[0.06] border border-glass-subtle">
              {filtered.length}
            </span>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск товара..."
            className="bg-white/[0.06] border border-glass-subtle rounded-xl px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-glass-strong w-44 transition-colors"
          />
        </div>
      )}

      {/* View tabs */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-hide">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setViewMode(tab.key);
              setCategoryFilter(null);
            }}
            className={cn(
              "px-2.5 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap",
              "backdrop-blur-xl border transition-all duration-200",
              viewMode === tab.key
                ? "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08] text-white border-glass-strong shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]"
                : "bg-white/[0.06] text-white/60 border-glass-subtle shadow-glass-inset hover:text-white hover:bg-white/[0.10]"
            )}
          >
            {tab.label}
          </button>
        ))}

        {categoryFilter && (
          <button
            onClick={() => setCategoryFilter(null)}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-accent-blue/20 text-accent-blue border border-accent-blue/20"
          >
            {categoryFilter} ✕
          </button>
        )}
      </div>

      {/* Category view */}
      {viewMode === "category" && !categoryFilter && (
        <>
          <div className="space-y-2 mb-4">
            {visibleCategories.map((cat, i) => (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <CategoryButton cat={cat} onClick={setCategoryFilter} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Product list */}
      {(viewMode !== "category" || categoryFilter) && (
        <div className="space-y-2">
          {visible.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <ProductRow product={product} viewMode={viewMode} />
            </motion.div>
          ))}

          {sorted.length === 0 && (
            <p className="text-center text-white/40 py-6">
              {viewMode === "loss" ? "Недостач за период нет" : "Ничего не найдено"}
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function ProductMatrix({ products, categories }: ProductMatrixProps) {
  // Main view state
  const [viewMode, setViewMode] = useState<ViewMode>("profit");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal — independent state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalViewMode, setModalViewMode] = useState<ViewMode>("profit");
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState("");

  // Compute filtered count to decide if "Смотреть все" button is needed
  const mainFilteredCount = useMemo(() => {
    let result = products;
    if (categoryFilter) result = result.filter((p) => p.category === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (viewMode === "loss") result = result.filter((p) => p.lossUnits > 0);
    return result.length;
  }, [products, categoryFilter, search, viewMode]);

  const hasMore =
    viewMode === "category" && !categoryFilter
      ? categories.length > 5
      : mainFilteredCount > TOP_LIMIT;

  if (products.length === 0 && categories.length === 0) {
    return (
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="p-6 text-center">
          <h3 className="text-lg font-semibold text-white mb-4">Товары</h3>
          <p className="text-white/40">Нет данных о товарах</p>
        </div>
      </div>
    );
  }

  const openModal = () => {
    // Sync initial state with main view
    setModalViewMode(viewMode);
    setModalCategoryFilter(categoryFilter);
    setModalSearch(search);
    setModalOpen(true);
  };

  return (
    <>
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="relative p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Товары</h3>

          <MatrixBody
            products={products}
            categories={categories}
            viewMode={viewMode}
            setViewMode={setViewMode}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            search={search}
            setSearch={setSearch}
            limit={TOP_LIMIT}
          />

          {hasMore && (
            <button
              onClick={openModal}
              className="w-full py-2.5 mt-2 text-sm text-white/40 hover:text-white/60 transition-colors rounded-xl border border-glass-subtle hover:border-glass"
            >
              Смотреть все товары
            </button>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Все товары" size="full">
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <MatrixBody
            products={products}
            categories={categories}
            viewMode={modalViewMode}
            setViewMode={setModalViewMode}
            categoryFilter={modalCategoryFilter}
            setCategoryFilter={setModalCategoryFilter}
            search={modalSearch}
            setSearch={setModalSearch}
            limit={null}
            unlimitedCategoryView
            showCountAndSearch
          />
        </div>
      </Modal>
    </>
  );
}

export function ProductMatrixSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-white/10 rounded" />
          <div className="h-8 w-44 bg-white/[0.06] rounded-xl" />
        </div>
        <div className="flex gap-1.5 mb-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-24 bg-white/[0.06] rounded-xl" />
          ))}
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle"
            >
              <div className="w-5 h-5 bg-white/10 rounded shrink-0" />
              <div className="w-8 h-8 bg-white/10 rounded-lg shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-28 bg-white/10 rounded mb-1" />
                <div className="h-3 w-16 bg-white/10 rounded" />
              </div>
              <div className="h-4 w-16 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

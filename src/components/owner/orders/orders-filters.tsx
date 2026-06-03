"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input, Button, DatePicker, ProductPicker } from "@/components/ui";
import type { ProductPickerItem } from "@/components/ui";
import {
  type OrdersFilters,
  ORDER_STATUS_OPTIONS,
  PAYMENT_OPTIONS,
  SOURCE_OPTIONS,
} from "@/hooks/use-owner-orders";
import { useOwnerProducts } from "@/hooks/use-owner-products";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/utils/cn";
import { displayToIso, isoToDisplay } from "@/utils/date-format";

export type StatsPeriod = "all" | "day" | "week" | "month";

/**
 * Для даты "естественный" порядок — desc (новые сверху),
 * для цены и дедлайна — asc (меньше/ближе сверху).
 * ↓ всегда означает "естественный" порядок, ↑ — обратный.
 */
const NATURAL_ORDER: Record<string, "asc" | "desc"> = {
  created_at: "desc",
  client_price: "asc",
  deadline: "asc",
};

function isNaturalOrder(sort: string, order: string): boolean {
  return order === (NATURAL_ORDER[sort] ?? "desc");
}

interface OrdersFiltersProps {
  filters: OrdersFilters;
  onChange: (filters: OrdersFilters) => void;
  period: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

const PERIOD_OPTIONS = [
  { value: "all" as const, label: "Все время" },
  { value: "day" as const, label: "День" },
  { value: "week" as const, label: "Неделя" },
  { value: "month" as const, label: "Месяц" },
];

export function OrdersFiltersComponent({
  filters,
  onChange,
  period,
  onPeriodChange,
}: OrdersFiltersProps) {
  const [search, setSearch] = useState(filters.search || "");
  const [isExpanded, setIsExpanded] = useState(
    !!filters.productId || !!filters.clientId || !!filters.sellerId
  );
  const debouncedSearch = useDebounce(search, 300);

  // Products for picker (фильтр заказов — admin view, нужны все товары платформы)
  const { data: productsData, isLoading: productsLoading } = useOwnerProducts({
    limit: 100,
    scope: "all",
  });
  const pickerProducts: ProductPickerItem[] = (productsData?.products || []).map((p) => ({
    id: p.id,
    name: p.name,
    photoUrl: p.photoUrl,
  }));

  // Клиентский пикер временно отключён: справочник клиентов переезжает в
  // Stage 2 на новую таблицу customers. filters.clientId остаётся в типе для
  // возможного deep-link-а из других мест (детали заказа и т.п.).

  const filtersRef = useRef(filters);
  const onChangeRef = useRef(onChange);
  filtersRef.current = filters;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (debouncedSearch !== filtersRef.current.search) {
      onChangeRef.current({ ...filtersRef.current, search: debouncedSearch || undefined, page: 1 });
    }
  }, [debouncedSearch]);

  const handleDateChange = useCallback(
    (field: "dateFrom" | "dateTo", value: string) => {
      onChange({ ...filters, [field]: value || undefined, page: 1 });
    },
    [filters, onChange]
  );

  const hasAdvancedFilters =
    filters.search ||
    (filters.status && filters.status !== "all") ||
    (filters.deliveryService && filters.deliveryService !== "all") ||
    (filters.payment && filters.payment !== "all") ||
    (filters.source && filters.source !== "all") ||
    filters.dateFrom ||
    filters.dateTo ||
    (filters.sort && filters.sort !== "created_at") ||
    filters.productId ||
    filters.clientId ||
    filters.sellerId;

  const handleReset = useCallback(() => {
    setSearch("");
    onChange({
      page: 1,
      limit: filters.limit,
      status: "all",
      deliveryService: "all",
      payment: "all",
      source: "all",
      sort: "created_at",
      order: "desc",
      productId: undefined,
      clientId: undefined,
      sellerId: undefined,
    });
    onPeriodChange("all");
  }, [filters.limit, onChange, onPeriodChange]);

  return (
    <div className="space-y-3">
      {/* Period quick filters */}
      <div className="flex items-center gap-1.5">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onPeriodChange(option.value)}
            className={cn(
              "px-2.5 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap",
              "backdrop-blur-xl border transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
              period === option.value
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
            {option.label}
          </button>
        ))}

        {/* Advanced filters toggle */}
        <Button
          variant={isExpanded ? "primary" : "secondary"}
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label="Фильтры"
          className={cn(
            "relative px-2.5 py-1.5",
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
          {hasAdvancedFilters && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-blue text-white text-xs font-bold rounded-full flex items-center justify-center">
              !
            </span>
          )}
        </Button>

        {/* Reset */}
        {(hasAdvancedFilters || period !== "all") && (
          <button
            onClick={handleReset}
            className="px-2 py-1.5 text-xs font-medium rounded-xl text-white/40 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl"
          >
            ✕
          </button>
        )}
      </div>

      {/* Expandable advanced filters */}
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
              {/* Search */}
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60 z-10 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <Input
                  type="text"
                  placeholder="Номер заказа, трек..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status filter */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Статус</label>
                <div className="flex flex-wrap gap-2">
                  {ORDER_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onChange({ ...filters, status: option.value, page: 1 })}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                        "shadow-glass-inset",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                        filters.status === option.value
                          ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                          : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment filter */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Оплата</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onChange({ ...filters, payment: option.value, page: 1 })}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                        "shadow-glass-inset",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                        (filters.payment ?? "all") === option.value
                          ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                          : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source filter (owner vs partner) */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Источник</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onChange({ ...filters, source: option.value, page: 1 })}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                        "shadow-glass-inset",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                        (filters.source ?? "all") === option.value
                          ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                          : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product filter */}
              <ProductPicker
                label="Товар"
                value={filters.productId}
                onChange={(productId) =>
                  onChange({ ...filters, productId: productId || undefined, page: 1 })
                }
                products={pickerProducts}
                isLoading={productsLoading}
                placeholder="Все товары"
              />

              {/* Client filter — временно отключён, вернётся в Stage 2 с новой моделью customers */}

              {/* Delivery service + Sort row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">
                    Служба доставки
                  </label>
                  <select
                    value={filters.deliveryService || "all"}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        deliveryService: e.target.value as OrdersFilters["deliveryService"],
                        page: 1,
                      })
                    }
                    className={cn(
                      "w-full px-3 py-2.5 text-sm rounded-xl",
                      "bg-white/[0.08] backdrop-blur-sm border border-glass text-white",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                    )}
                  >
                    <option value="all">Все службы</option>
                    <option value="avito">Avito</option>
                    <option value="yandex">Яндекс</option>
                    <option value="cdek">СДЭК</option>
                    <option value="pochta">Почта</option>
                    <option value="5post">5Post</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Сортировка</label>
                  <div className="flex gap-2">
                    <select
                      value={filters.sort || "created_at"}
                      onChange={(e) => {
                        const sort = e.target.value as OrdersFilters["sort"];
                        onChange({
                          ...filters,
                          sort,
                          order: NATURAL_ORDER[sort || "created_at"] ?? "desc",
                          page: 1,
                        });
                      }}
                      className={cn(
                        "flex-1 px-3 py-2.5 text-sm rounded-xl",
                        "bg-white/[0.08] backdrop-blur-sm border border-glass text-white",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                      )}
                    >
                      <option value="created_at">Дата</option>
                      <option value="client_price">Цена</option>
                      <option value="deadline">Дедлайн</option>
                    </select>
                    <button
                      onClick={() =>
                        onChange({ ...filters, order: filters.order === "asc" ? "desc" : "asc" })
                      }
                      className={cn(
                        "px-3 py-2.5 text-sm rounded-xl",
                        "bg-white/[0.08] backdrop-blur-sm border border-glass text-white",
                        "hover:bg-white/[0.12] transition-colors"
                      )}
                    >
                      {isNaturalOrder(filters.sort || "created_at", filters.order || "desc")
                        ? "↓"
                        : "↑"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Date range */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Период</label>
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker
                    label="От"
                    value={isoToDisplay(filters.dateFrom || "")}
                    onChange={(displayDate) =>
                      handleDateChange("dateFrom", displayToIso(displayDate))
                    }
                    placeholder="дд.мм.гггг"
                  />
                  <DatePicker
                    label="До"
                    value={isoToDisplay(filters.dateTo || "")}
                    onChange={(displayDate) =>
                      handleDateChange("dateTo", displayToIso(displayDate))
                    }
                    placeholder="дд.мм.гггг"
                  />
                </div>
              </div>

              {/* Reset button */}
              {hasAdvancedFilters && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="w-full">
                  Сбросить все фильтры
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Input, Button } from "@/components/ui";
import { type OrdersFilters, ORDER_STATUS_OPTIONS } from "@/hooks/use-owner-orders";
import { useDebounce } from "@/hooks/use-debounce";

interface OrdersFiltersProps {
  filters: OrdersFilters;
  onChange: (filters: OrdersFilters) => void;
}

export function OrdersFiltersComponent({ filters, onChange }: OrdersFiltersProps) {
  const [search, setSearch] = useState(filters.search || "");
  const debouncedSearch = useDebounce(search, 300);
  const filtersRef = useRef(filters);
  const onChangeRef = useRef(onChange);
  filtersRef.current = filters;
  onChangeRef.current = onChange;

  // Обновляем поиск с debounce
  useEffect(() => {
    if (debouncedSearch !== filtersRef.current.search) {
      onChangeRef.current({ ...filtersRef.current, search: debouncedSearch || undefined, page: 1 });
    }
  }, [debouncedSearch]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden space-y-4 p-4 rounded-2xl backdrop-blur-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card"
    >
      {/* Поиск */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60"
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

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2">
        {/* Статус */}
        <div className="flex items-center gap-2 flex-wrap">
          {ORDER_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ ...filters, status: option.value, page: 1 })}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filters.status === option.value
                  ? "bg-white/[0.12] border-glass-active text-white shadow-glass-inset"
                  : "border-glass text-white/60 hover:text-white hover:bg-white/[0.06] hover:border-glass-active"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Дополнительные фильтры */}
      <div className="flex flex-wrap gap-3">
        {/* Служба доставки */}
        <select
          value={filters.deliveryService || "all"}
          onChange={(e) =>
            onChange({
              ...filters,
              deliveryService: e.target.value as OrdersFilters["deliveryService"],
              page: 1,
            })
          }
          className="px-3 py-2 text-sm rounded-lg bg-white/[0.08] backdrop-blur-sm border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        >
          <option value="all">Все службы</option>
          <option value="avito">Avito</option>
          <option value="yandex">Яндекс</option>
          <option value="cdek">СДЭК</option>
          <option value="pochta">Почта</option>
          <option value="5post">5Post</option>
        </select>

        {/* Дата от */}
        <input
          type="date"
          value={filters.dateFrom || ""}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined, page: 1 })}
          className="px-3 py-2 text-sm rounded-lg bg-white/[0.08] backdrop-blur-sm border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        />

        {/* Дата до */}
        <input
          type="date"
          value={filters.dateTo || ""}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined, page: 1 })}
          className="px-3 py-2 text-sm rounded-lg bg-white/[0.08] backdrop-blur-sm border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        />

        {/* Сортировка */}
        <select
          value={filters.sort || "created_at"}
          onChange={(e) =>
            onChange({ ...filters, sort: e.target.value as OrdersFilters["sort"], page: 1 })
          }
          className="px-3 py-2 text-sm rounded-lg bg-white/[0.08] backdrop-blur-sm border border-glass text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        >
          <option value="created_at">По дате</option>
          <option value="order_number">По номеру</option>
          <option value="client_price">По сумме</option>
          <option value="deadline">По дедлайну</option>
        </select>

        {/* Направление сортировки */}
        <button
          onClick={() => onChange({ ...filters, order: filters.order === "asc" ? "desc" : "asc" })}
          className="px-3 py-2 text-sm rounded-lg bg-white/[0.08] backdrop-blur-sm border border-glass text-white hover:bg-white/[0.06] transition-colors"
        >
          {filters.order === "asc" ? "↑ По возрастанию" : "↓ По убыванию"}
        </button>

        {/* Сброс фильтров */}
        {(filters.search ||
          filters.status !== "all" ||
          filters.deliveryService !== "all" ||
          filters.dateFrom ||
          filters.dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              onChange({
                page: 1,
                limit: filters.limit,
                status: "all",
                deliveryService: "all",
                sort: "created_at",
                order: "desc",
              });
            }}
          >
            Сбросить
          </Button>
        )}
      </div>
    </motion.div>
  );
}

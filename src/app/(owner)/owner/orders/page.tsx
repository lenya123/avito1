"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useOwnerOrders, type OrdersFilters } from "@/hooks/use-owner-orders";
import { ErrorState, Button, Empty, EmptyPresets } from "@/components/ui";
import { cn } from "@/utils/cn";
import { OrdersFiltersComponent, OrderCard, OrderCardSkeleton } from "@/components/owner/orders";

export default function OwnerOrdersPage() {
  const [filters, setFilters] = useState<OrdersFilters>({
    page: 1,
    limit: 20,
    status: "all",
    deliveryService: "all",
    sort: "created_at",
    order: "desc",
  });

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useOwnerOrders(filters);

  const toggleOrderSelection = (id: string) => {
    const newSelection = new Set(selectedOrders);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedOrders(newSelection);
  };

  const selectAll = () => {
    if (data?.orders) {
      if (selectedOrders.size === data.orders.length) {
        setSelectedOrders(new Set());
      } else {
        setSelectedOrders(new Set(data.orders.map((o) => o.id)));
      }
    }
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить список заказов"
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
          <h1 className="text-2xl font-bold text-white">Заказы</h1>
          <p className="text-white/60 mt-1">Управление всеми заказами системы</p>
        </div>
      </motion.div>

      {/* Summary stats */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-white">
              {data.stats.totalOrders.toLocaleString()}
            </p>
            <p className="text-sm text-white/60">Заказов</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-green">
              {data.stats.totalRevenue.toLocaleString()} ₽
            </p>
            <p className="text-sm text-white/60">Выручка</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-purple">
              {data.stats.totalProfit.toLocaleString()} ₽
            </p>
            <p className="text-sm text-white/60">Прибыль</p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <OrdersFiltersComponent filters={filters} onChange={setFilters} />
      </motion.div>

      {/* Bulk actions */}
      {selectedOrders.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card"
        >
          <span className="text-sm text-white">Выбрано: {selectedOrders.size}</span>
          <Button variant="ghost" size="sm" onClick={() => setSelectedOrders(new Set())}>
            Снять выбор
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" size="sm">
            Экспорт
          </Button>
        </motion.div>
      )}

      {/* Results count & select all */}
      {data && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/60">Найдено: {data.pagination.total} заказов</p>
          <button
            onClick={selectAll}
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            {selectedOrders.size === data.orders.length ? "Снять выбор" : "Выбрать все"}
          </button>
        </div>
      )}

      {/* Orders list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => <OrderCardSkeleton key={i} />)
        ) : data?.orders.length === 0 ? (
          <Empty {...EmptyPresets.orders} />
        ) : (
          data?.orders.map((order, index) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.03 }}
            >
              <OrderCard
                order={order}
                index={index}
                selected={selectedOrders.has(order.id)}
                onSelect={toggleOrderSelection}
              />
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

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(data.pagination.totalPages, 5) }).map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setFilters({ ...filters, page: pageNum })}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm transition-colors duration-200",
                    (filters.page || 1) === pageNum
                      ? "bg-white/[0.12] text-white shadow-glass-inset"
                      : "text-white/60 hover:text-white"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            {data.pagination.totalPages > 5 && (
              <>
                <span className="text-white/40">...</span>
                <button
                  onClick={() => setFilters({ ...filters, page: data.pagination.totalPages })}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm transition-colors duration-200",
                    (filters.page || 1) === data.pagination.totalPages
                      ? "bg-white/[0.12] text-white shadow-glass-inset"
                      : "text-white/60 hover:text-white"
                  )}
                >
                  {data.pagination.totalPages}
                </button>
              </>
            )}
          </div>

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

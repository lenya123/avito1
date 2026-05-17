"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useOwnerClients, type ClientsFilters } from "@/hooks/use-owner-clients";
import { ErrorState, Button, Empty, EmptyPresets } from "@/components/ui";
import {
  ClientCard,
  ClientCardSkeleton,
  ClientsFiltersComponent,
} from "@/components/owner/clients";
import { cn } from "@/utils/cn";

export default function OwnerClientsPage() {
  const [filters, setFilters] = useState<ClientsFilters>({
    page: 1,
    limit: 20,
    status: "all",
    tier: "all",
    sort: "created_at",
    order: "desc",
  });

  const { data, isLoading, error, refetch } = useOwnerClients(filters);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить список клиентов"
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
          <h1 className="text-2xl font-bold text-white">Клиенты</h1>
          <p className="text-white/60 mt-1">Управление клиентами системы</p>
        </div>
      </motion.div>

      {/* Summary stats */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
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
            <p className="text-2xl font-bold text-accent-purple">{data.summary.premium}</p>
            <p className="text-sm text-white/60">Premium</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-orange">{data.summary.vibePlus}</p>
            <p className="text-sm text-white/60">+ВАЙБ</p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <ClientsFiltersComponent filters={filters} onChange={setFilters} />
      </motion.div>

      {/* Results count */}
      {data && <p className="text-sm text-white/60">Найдено: {data.pagination.total} клиентов</p>}

      {/* Clients list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => <ClientCardSkeleton key={i} />)
        ) : data?.clients.length === 0 ? (
          <Empty {...EmptyPresets.clients} />
        ) : (
          data?.clients.map((client, index) => (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.03 }}
            >
              <ClientCard client={client} index={index} />
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

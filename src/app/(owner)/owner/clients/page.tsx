"use client";

import { useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useOwnerClients, type ClientsFilters } from "@/hooks/use-owner-clients";
import { Card } from "@/components/ui/card";
import { Pagination, Empty } from "@/components/ui";
import {
  ClientCard,
  ClientCardSkeleton,
  ClientsFiltersComponent,
} from "@/components/owner/clients";

export default function OwnerClientsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const filters = useMemo<ClientsFilters>(
    () => ({
      page: Number(searchParams.get("page")) || 1,
      limit: 20,
      vibe: (searchParams.get("vibe") as ClientsFilters["vibe"]) || "all",
      frozen: (searchParams.get("frozen") as ClientsFilters["frozen"]) || "all",
      blocked: (searchParams.get("blocked") as ClientsFilters["blocked"]) || "all",
      sort: (searchParams.get("sort") as ClientsFilters["sort"]) || "created_at",
      order: (searchParams.get("order") as ClientsFilters["order"]) || "desc",
      search: searchParams.get("q") || undefined,
    }),
    [searchParams]
  );

  const setFilters = useCallback(
    (next: ClientsFilters) => {
      const params = new URLSearchParams();
      if (next.page && next.page > 1) params.set("page", String(next.page));
      if (next.search) params.set("q", next.search);
      if (next.vibe && next.vibe !== "all") params.set("vibe", next.vibe);
      if (next.frozen && next.frozen !== "all") params.set("frozen", next.frozen);
      if (next.blocked && next.blocked !== "all") params.set("blocked", next.blocked);
      if (next.sort && next.sort !== "created_at") params.set("sort", next.sort);
      if (next.order && next.order !== "desc") params.set("order", next.order);
      const qs = params.toString();
      router.replace(`/owner/clients${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router]
  );

  const { data, isLoading } = useOwnerClients(filters);

  const summary = data?.summary;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Клиенты</h1>
          <p className="text-white/60 mt-1">
            Клиенты оптовика. Появляются автоматически через Telegram customer-bot.
          </p>
        </div>
      </motion.div>

      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          <SummaryStat label="Всего клиентов" value={summary.total} />
          <SummaryStat label="С +ВАЙБ" value={summary.vibeEnabled} accent="blue" />
          <SummaryStat label="Заморожены" value={summary.frozen} accent="orange" />
          <SummaryStat label="Заблокированы" value={summary.blocked} accent="red" />
        </motion.div>
      )}

      <ClientsFiltersComponent filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ClientCardSkeleton key={i} />
          ))}
        </div>
      ) : !data || data.customers.length === 0 ? (
        <Empty
          icon="👥"
          title={filters.search ? "Ничего не найдено" : "Клиентов пока нет"}
          description={
            filters.search
              ? "Попробуйте изменить поиск или сбросить фильтры."
              : "Клиенты появятся автоматически, когда напишут /start в Telegram-бот оптовика."
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {data.customers.map((client, idx) => (
              <ClientCard key={client.id} client={client} index={idx} />
            ))}
          </div>

          {data.pagination.totalPages > 1 && (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={(page) => setFilters({ ...filters, page })}
            />
          )}
        </>
      )}
    </div>
  );
}

interface SummaryStatProps {
  label: string;
  value: number;
  accent?: "blue" | "orange" | "red";
}

function SummaryStat({ label, value, accent }: SummaryStatProps) {
  const accentClass =
    accent === "blue"
      ? "text-accent-blue"
      : accent === "orange"
        ? "text-accent-orange"
        : accent === "red"
          ? "text-accent-red"
          : "text-white";
  return (
    <Card variant="glass" padding="md">
      <div className="text-white/60 text-xs uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accentClass}`}>{value}</div>
    </Card>
  );
}

"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { Modal } from "@/components/ui";
import { ProgressRing } from "./progress-ring";
import type { OwnerAnalyticsResponse } from "@/hooks/use-owner-analytics";

interface ClientAnalyticsProps {
  stats: OwnerAnalyticsResponse["clientStats"];
  topClients: OwnerAnalyticsResponse["topClients"];
}

type ClientSortKey = "revenue" | "profit" | "orders";
type TopClient = OwnerAnalyticsResponse["topClients"][number];

const TOP_LIMIT = 5;

const SORT_OPTIONS: Array<{ key: ClientSortKey; label: string }> = [
  { key: "revenue", label: "По выручке" },
  { key: "profit", label: "По прибыли" },
  { key: "orders", label: "По заказам" },
];

function isAtRisk(lastOrderDate: string | null): boolean {
  if (!lastOrderDate) return true;
  const daysSince = (Date.now() - new Date(lastOrderDate).getTime()) / 86400000;
  return daysSince > 30;
}

function ClientRow({
  client,
  rank,
  sortKey,
}: {
  client: TopClient;
  rank: number;
  sortKey: ClientSortKey;
}) {
  const atRisk = isAtRisk(client.lastOrderDate);
  return (
    <Link
      href={`/owner/clients/${client.id}`}
      className="relative flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.06] transition-colors overflow-hidden"
    >
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          width: `${client.revenueShare}%`,
          backgroundColor: "rgba(191, 90, 242, 0.06)",
        }}
      />

      <span className="relative text-sm text-white/40 w-5 shrink-0 text-center">{rank}</span>
      <div className="relative w-8 h-8 rounded-full bg-gradient-to-b from-purple-500/30 to-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0">
        <span className="text-accent-purple text-sm font-medium">
          {(client.username || client.name || "?").charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="relative flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-white truncate">@{client.username || client.name || "—"}</p>
          {atRisk && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-accent-orange/20 text-accent-orange shrink-0">
              at risk
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span>{client.orders} заказов</span>
          <span>Ср. чек {formatPrice(client.aov)}</span>
        </div>
      </div>
      <div className="relative text-right shrink-0">
        <p className="text-sm font-medium text-accent-green">
          {formatPrice(sortKey === "profit" ? client.profit : client.revenue)}
        </p>
        <p className="text-2xs text-white/40">{client.revenueShare}%</p>
      </div>
    </Link>
  );
}

function SortPills({
  value,
  onChange,
}: {
  value: ClientSortKey;
  onChange: (k: ClientSortKey) => void;
}) {
  return (
    <div className="flex gap-1.5 mb-4">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            "px-2.5 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap",
            "backdrop-blur-xl border transition-all duration-200",
            value === opt.key
              ? "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08] text-white border-glass-strong"
              : "bg-white/[0.06] text-white/60 border-glass-subtle shadow-glass-inset hover:text-white"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ClientAnalytics({ stats, topClients }: ClientAnalyticsProps) {
  const [sortKey, setSortKey] = useState<ClientSortKey>("revenue");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSortKey, setModalSortKey] = useState<ClientSortKey>("revenue");

  const sorted = useMemo(
    () => [...topClients].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number)),
    [topClients, sortKey]
  );

  const modalSorted = useMemo(
    () => [...topClients].sort((a, b) => (b[modalSortKey] as number) - (a[modalSortKey] as number)),
    [topClients, modalSortKey]
  );

  const topVisible = sorted.slice(0, TOP_LIMIT);
  const hasMore = topClients.length > TOP_LIMIT;

  const totalRevenue = stats.newRevenue + stats.returningRevenue;
  const newPercent = totalRevenue > 0 ? Math.round((stats.newRevenue / totalRevenue) * 100) : 0;

  const repeatColor =
    stats.repeatPurchaseRate >= 40
      ? "var(--accent-green)"
      : stats.repeatPurchaseRate >= 20
        ? "var(--accent-blue)"
        : "var(--accent-orange)";

  const avgOrdersColor =
    stats.avgOrdersPerClient >= 3
      ? "var(--accent-green)"
      : stats.avgOrdersPerClient >= 1.5
        ? "var(--accent-blue)"
        : "var(--accent-orange)";

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Overview */}
        <div
          className={cn(
            "relative rounded-2xl overflow-hidden",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "backdrop-blur-xl border border-glass shadow-card"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="relative p-6">
            <h3 className="text-lg font-semibold text-white mb-5">Клиенты</h3>

            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass flex flex-col items-center gap-1.5">
                <ProgressRing
                  value={stats.repeatPurchaseRate}
                  size={48}
                  strokeWidth={4}
                  color={repeatColor}
                  showLabel
                />
                <p className="text-2xs text-white/40">Постоянные</p>
                <p className="text-2xs text-white/20">5+/мес, 2+ мес</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass flex flex-col items-center gap-1.5">
                <ProgressRing
                  value={Math.min(stats.avgOrdersPerClient * 10, 100)}
                  size={48}
                  strokeWidth={4}
                  color={avgOrdersColor}
                  showLabel
                  labelOverride={stats.avgOrdersPerClient}
                />
                <p className="text-2xs text-white/40">Заказов/кл.</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass flex flex-col items-center justify-center">
                <p className="text-lg font-bold text-white">
                  {formatPrice(stats.revenuePerClient)}
                </p>
                <p className="text-2xs text-white/40">Выручка/кл.</p>
              </div>
            </div>

            {/* New vs Returning bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-white/40">Новые vs Постоянные</span>
                <span className="text-xs text-white/40">
                  {newPercent}% / {100 - newPercent}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-white/[0.08] overflow-hidden flex">
                {newPercent > 0 && (
                  <motion.div
                    className={cn(
                      "h-full bg-accent-blue",
                      newPercent >= 100 ? "rounded-full" : "rounded-l-full"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${newPercent}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                )}
                {100 - newPercent > 0 && (
                  <motion.div
                    className={cn(
                      "h-full bg-accent-green",
                      newPercent <= 0 ? "rounded-full" : "rounded-r-full"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${100 - newPercent}%` }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-accent-blue" />
                  <span className="text-2xs text-white/40">
                    Новые {formatPrice(stats.newRevenue)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-accent-green" />
                  <span className="text-2xs text-white/40">
                    Постоянные {formatPrice(stats.returningRevenue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Summary counts */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-glass-subtle text-xs text-white/40">
              <span>Новых: {stats.new}</span>
              <span>Активных: {stats.active}</span>
              <span>Постоянных: {stats.loyal}</span>
              <span>Ушли: {stats.churned}</span>
            </div>
          </div>
        </div>

        {/* Right: Top 5 */}
        <div
          className={cn(
            "relative rounded-2xl overflow-hidden",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "backdrop-blur-xl border border-glass shadow-card"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white">Топ клиентов</h3>
            </div>

            <SortPills value={sortKey} onChange={setSortKey} />

            {topVisible.length === 0 ? (
              <p className="text-center text-white/40 py-8">Нет данных</p>
            ) : (
              <div className="space-y-2">
                {topVisible.map((client, i) => (
                  <motion.div
                    key={client.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <ClientRow client={client} rank={i + 1} sortKey={sortKey} />
                  </motion.div>
                ))}

                {hasMore && (
                  <button
                    onClick={() => {
                      setModalSortKey(sortKey);
                      setModalOpen(true);
                    }}
                    className="w-full py-2.5 mt-2 text-sm text-white/40 hover:text-white/60 transition-colors rounded-xl border border-glass-subtle hover:border-glass"
                  >
                    Смотреть всех клиентов ({topClients.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: full client list */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Все клиенты" size="full">
        <SortPills value={modalSortKey} onChange={setModalSortKey} />
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {modalSorted.map((client, i) => (
            <ClientRow key={client.id} client={client} rank={i + 1} sortKey={modalSortKey} />
          ))}
          {modalSorted.length === 0 && <p className="text-center text-white/40 py-8">Нет данных</p>}
        </div>
      </Modal>
    </>
  );
}

export function ClientAnalyticsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {[0, 1].map((j) => (
        <div
          key={j}
          className={cn(
            "relative rounded-2xl overflow-hidden animate-pulse",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass shadow-card"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="p-6">
            <div className="h-6 w-28 bg-white/10 rounded mb-5" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-white/[0.06] rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

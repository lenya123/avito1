"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { useAiSalesStats } from "@/hooks/use-ai-sales";
import Link from "next/link";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 дней" },
  { value: 14, label: "14 дней" },
  { value: 30, label: "30 дней" },
] as const;

export default function AiSalesAnalyticsPage() {
  const [days, setDays] = useState(7);
  const { data: stats, isLoading } = useAiSalesStats(days);

  return (
    <div className="min-h-screen bg-[#0a0a0c] pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 pt-14 pb-4 flex items-center gap-3"
      >
        <Link
          href="/owner/ai-sales"
          className="p-2 rounded-xl bg-white/[0.06] border border-glass-subtle text-white/40"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Аналитика</h1>
          <p className="text-xs text-white/40">AI Продажник</p>
        </div>
      </motion.div>

      {/* Период */}
      <div className="px-4 mb-5 flex gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200",
              days === opt.value
                ? "bg-accent-purple/30 text-accent-purple/80 border border-accent-purple/40"
                : "bg-white/[0.06] text-white/40 border border-glass-subtle"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="px-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-white/[0.04] border border-glass-subtle animate-pulse"
            />
          ))}
        </div>
      ) : stats ? (
        <div className="px-4 space-y-4">
          {/* Итоги */}
          <MetricGrid
            items={[
              { label: "Входящих", value: stats.totals.totalIncoming, color: "text-white" },
              { label: "Черновиков", value: stats.totals.totalDrafts, color: "text-accent-purple" },
              { label: "Одобрено", value: stats.totals.totalApproved, color: "text-accent-green" },
              {
                label: "Отредактировано",
                value: stats.totals.totalEdited,
                color: "text-accent-orange",
              },
              { label: "Отклонено", value: stats.totals.totalRejected, color: "text-accent-red" },
              {
                label: "Авто-отправлено",
                value: stats.totals.totalAutoSent,
                color: "text-accent-blue",
              },
            ]}
          />

          {/* Качество */}
          <AnalyticsCard title="Качество" delay={0.1}>
            <div className="grid grid-cols-2 gap-3">
              <MetricItem
                label="Accuracy"
                value={stats.totals.avgApprovalRate ? `${stats.totals.avgApprovalRate}%` : "—"}
                color="text-accent-green"
              />
              <MetricItem
                label="Стоимость"
                value={`$${stats.totals.estimatedCostUsd}`}
                color="text-accent-blue"
              />
              <MetricItem
                label="Токены"
                value={formatNumber(stats.totals.totalTokens)}
                color="text-accent-purple"
              />
              <MetricItem
                label="Истекло"
                value={String(stats.totals.totalExpired)}
                color="text-white/40"
              />
            </div>
          </AnalyticsCard>

          {/* По дням */}
          <AnalyticsCard title="По дням" delay={0.15}>
            {stats.daily.length === 0 ? (
              <p className="text-sm text-white/20 text-center py-4">Нет данных за период</p>
            ) : (
              <div className="space-y-2">
                {stats.daily.map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.04]"
                  >
                    <span className="text-xs text-white/40 w-20">{formatDate(d.date)}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-white/60">{d.totalDrafts} чн</span>
                      <span className="text-accent-green">{d.totalApproved} ок</span>
                      {d.totalEdited > 0 && (
                        <span className="text-accent-orange">{d.totalEdited} ред</span>
                      )}
                      {d.approvalRate !== null && (
                        <span className="text-accent-purple">{d.approvalRate}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AnalyticsCard>
        </div>
      ) : null}
    </div>
  );
}

function MetricGrid({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="grid grid-cols-3 gap-3"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "p-3 rounded-2xl",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass shadow-card"
          )}
        >
          <p className="text-xs text-white/40 mb-1">{item.label}</p>
          <p className={cn("text-lg font-bold", item.color)}>{item.value}</p>
        </div>
      ))}
    </motion.div>
  );
}

function MetricItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.04]">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p className={cn("text-base font-bold", color)}>{value}</p>
    </div>
  );
}

function AnalyticsCard({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        "p-4 rounded-2xl",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass shadow-card"
      )}
    >
      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </motion.div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

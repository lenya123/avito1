"use client";

import Link from "next/link";

import { cn } from "@/utils/cn";
import { useAvitoAiAgentStatus, useAvitoOverview } from "@/hooks/use-avito";
import { Skeleton } from "@/components/ui";

const modeLabels: Record<string, string> = {
  draft: "Черновики",
  auto_simple: "Авто (простой)",
  auto_full: "Авто (полный)",
};

export function AiAgentCard() {
  const { data, isLoading } = useAvitoAiAgentStatus();
  const { data: overview } = useAvitoOverview();

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden p-4",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-4">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
      </div>
    );
  }

  const isEnabled = data?.isEnabled ?? false;
  const mode = data?.mode ?? null;
  const todayStats = data?.todayStats ?? { incoming: 0, drafts: 0, approved: 0 };
  const pendingDrafts = data?.pendingDrafts ?? 0;
  const ai = overview?.aiAgent ?? { incoming: 0, responses: 0, conversion: 0 };

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">AI-агент продаж</h3>
        {pendingDrafts > 0 && (
          <span
            className={cn(
              "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium",
              "bg-accent-blue/20 text-accent-blue border border-accent-blue/30"
            )}
          >
            {pendingDrafts} черн.
          </span>
        )}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-3">
        {isEnabled ? (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-green" />
            </span>
            <span className="text-sm text-accent-green font-medium">Активен</span>
          </>
        ) : (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="text-sm text-white/40 font-medium">Выключен</span>
          </>
        )}

        {/* Mode label */}
        {isEnabled && mode && modeLabels[mode] && (
          <span className="text-xs text-white/40 ml-1">· {modeLabels[mode]}</span>
        )}
      </div>

      {/* За месяц: входящие / ответы / конверсия (% заказов от переписок) */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="text-center p-2 rounded-xl bg-white/[0.04]">
          <p className="text-lg font-semibold text-white">{ai.incoming.toLocaleString("ru")}</p>
          <p className="text-xs text-white/40">Входящие (мес)</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-white/[0.04]">
          <p className="text-lg font-semibold text-accent-blue">
            {ai.responses.toLocaleString("ru")}
          </p>
          <p className="text-xs text-white/40">Ответы (мес)</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-white/[0.04]">
          <p className="text-lg font-semibold text-accent-green">{ai.conversion}%</p>
          <p className="text-xs text-white/40">Конверсия</p>
        </div>
      </div>

      {/* Сегодня (мелким) */}
      <p className="text-xs text-white/40 mb-3">
        Сегодня: входящие {todayStats.incoming} · черновики {todayStats.drafts} · одобрено{" "}
        {todayStats.approved}
      </p>

      {/* Settings link */}
      <Link
        href="/avito/settings"
        className="text-xs text-accent-blue font-medium hover:text-accent-blue/80 transition-colors"
      >
        Настроить →
      </Link>
    </div>
  );
}

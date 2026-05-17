"use client";

import { BackButton, Button } from "@/components/ui";
import { useAvitoOverview } from "@/hooks/use-avito";
import { AvitoAccountSwitcher } from "@/components/client/avito/avito-account-switcher";

interface DashboardHeaderProps {
  onSync: () => void;
  isSyncing: boolean;
}

export function DashboardHeader({ onSync, isSyncing }: DashboardHeaderProps) {
  const { data: overview } = useAvitoOverview();

  const lastSyncText = overview?.lastSyncedAt ? formatTimeAgo(overview.lastSyncedAt) : null;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BackButton href="/profile" />
          <div>
            <h1 className="text-xl font-bold text-white">Avito</h1>
            {overview?.profile && (
              <p className="text-sm text-white/40 mt-0.5">{overview.profile.name}</p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="bg-white/[0.06] text-white/60 border border-glass-subtle shadow-glass-inset hover:text-white hover:bg-white/[0.10] hover:border-white/20"
          onClick={onSync}
          disabled={isSyncing}
          isLoading={isSyncing}
          leftIcon={
            !isSyncing ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : undefined
          }
        >
          Синхронизировать
        </Button>
      </div>

      <AvitoAccountSwitcher />

      {lastSyncText && <p className="text-xs text-white/40 mb-4 mt-1">Обновлено {lastSyncText}</p>}
    </>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "только что";
  if (diffMins < 60) return `${diffMins} мин назад`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  return date.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

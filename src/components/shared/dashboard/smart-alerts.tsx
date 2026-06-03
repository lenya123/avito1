"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/utils/cn";
import { Card, Button } from "@/components/ui";

interface DashboardAlert {
  id: string;
  type: "urgent" | "warning" | "info";
  title: string;
  message: string;
  count: number;
  actionUrl: string;
  actionLabel: string;
}

interface FraudAlert {
  id: string;
  alertType: string;
  severity: string | null;
  userId: string | null;
  details: Record<string, unknown> | null;
  isResolved: boolean;
  createdAt: string;
}

const FRAUD_LABELS: Record<string, string> = {
  duplicate_fingerprint: "Дубликат устройства",
  self_referral: "Самореферал",
  rapid_orders: "Быстрые заказы",
  deposit_abuse: "Злоупотребление депозитом",
  return_abuse: "Злоупотребление возвратами",
  suspicious_cancellation: "Подозрительная отмена",
};

async function fetchFraudAlerts(): Promise<FraudAlert[]> {
  const res = await fetch("/api/owner/fraud-alerts");
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts || [];
}

async function resolveFraudAlert(id: string) {
  const res = await fetch(`/api/owner/fraud-alerts/${id}`, { method: "PATCH" });
  if (!res.ok) throw new Error("Ошибка");
  return res.json();
}

const TYPE_STYLES: Record<string, { bar: string; icon: string }> = {
  urgent: { bar: "bg-accent-red", icon: "text-accent-red" },
  warning: { bar: "bg-accent-orange", icon: "text-accent-orange" },
  info: { bar: "bg-accent-blue", icon: "text-accent-blue" },
};

interface SmartAlertsProps {
  alerts: DashboardAlert[];
}

export function SmartAlerts({ alerts: dashboardAlerts }: SmartAlertsProps) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { data: fraudAlerts } = useQuery({
    queryKey: ["owner", "fraud-alerts"],
    queryFn: fetchFraudAlerts,
    staleTime: 60000,
  });

  const resolve = useMutation({
    mutationFn: resolveFraudAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner", "fraud-alerts"] }),
  });

  const unresolvedFraud = (fraudAlerts || []).filter((a) => !a.isResolved);

  // Merge all alerts into unified list
  type UnifiedAlert = {
    id: string;
    type: "urgent" | "warning" | "info";
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
    onResolve?: () => void;
  };

  const allAlerts: UnifiedAlert[] = [
    ...dashboardAlerts.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      actionUrl: a.actionUrl,
      actionLabel: a.actionLabel,
    })),
    ...unresolvedFraud.map((a) => ({
      id: a.id,
      type: (a.severity === "high" ? "urgent" : "warning") as "urgent" | "warning",
      title: FRAUD_LABELS[a.alertType] || a.alertType,
      message: new Date(a.createdAt).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      onResolve: () => resolve.mutate(a.id),
    })),
  ];

  // Sort: urgent first, then warning, then info
  const priority = { urgent: 0, warning: 1, info: 2 };
  allAlerts.sort((a, b) => priority[a.type] - priority[b.type]);

  if (allAlerts.length === 0) return null;

  const visible = expanded ? allAlerts : allAlerts.slice(0, 5);
  const hiddenCount = allAlerts.length - 5;

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-accent-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <h3 className="text-base font-medium text-white">Внимание</h3>
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-accent-orange/20 text-accent-orange font-medium">
              {allAlerts.length}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {visible.map((alert) => {
              const style = TYPE_STYLES[alert.type] || TYPE_STYLES.info;
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04]"
                >
                  <div className={cn("w-1 self-stretch rounded-full shrink-0", style.bar)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", style.icon)}>{alert.title}</p>
                    <p className="text-2xs text-white/40 mt-0.5">{alert.message}</p>
                  </div>
                  {alert.actionUrl ? (
                    <Link href={alert.actionUrl}>
                      <Button variant="ghost" size="sm">
                        {alert.actionLabel || "Открыть"}
                      </Button>
                    </Link>
                  ) : alert.onResolve ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={alert.onResolve}
                      isLoading={resolve.isPending}
                    >
                      Закрыть
                    </Button>
                  ) : null}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {hiddenCount > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-2 text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            Ещё {hiddenCount}...
          </button>
        )}
        {expanded && allAlerts.length > 5 && (
          <button
            onClick={() => setExpanded(false)}
            className="mt-2 text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            Свернуть
          </button>
        )}
      </div>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, Skeleton } from "@/components/ui";

interface OrderPipelineCardProps {
  pipeline: {
    awaitingShipment: number;
    awaitingShipmentOverdue: number;
    collecting: number;
    collectingOverdue: number;
    inTransit: number;
    inTransitOverdue: number;
    completedToday: number;
    returns: number;
    slaHours: Record<string, number>;
  };
}

const OVERDUE_KEYS: Record<string, string> = {
  awaitingShipment: "awaitingShipmentOverdue",
  collecting: "collectingOverdue",
  inTransit: "inTransitOverdue",
};

// Канон §4.2: paid → collecting → sent + return → return_done.
// UI-ключи (awaitingShipment/inTransit/...) сохранены — это локальные имена
// pipeline-этапов, мапятся на канонические БД-статусы.
const SLA_STATUS_MAP: Record<string, string> = {
  awaitingShipment: "paid",
  collecting: "collecting",
  inTransit: "sent",
};

const STAGES = [
  {
    key: "awaitingShipment" as const,
    label: "Ожидают",
    color: "var(--accent-orange)",
    href: "/owner/orders?status=paid",
  },
  {
    key: "collecting" as const,
    label: "Собираются",
    color: "var(--accent-teal)",
    href: "/owner/orders?status=collecting",
  },
  {
    key: "inTransit" as const,
    label: "Отправлены",
    color: "var(--accent-blue)",
    href: "/owner/orders?status=sent",
  },
  {
    key: "completedToday" as const,
    label: "Сегодня",
    color: "var(--accent-green)",
    href: "/owner/orders?status=sent",
  },
  {
    key: "returns" as const,
    label: "Возвраты",
    color: "var(--accent-red)",
    href: "/owner/orders?status=return",
  },
];

export function OrderPipelineCard({ pipeline }: OrderPipelineCardProps) {
  const maxValue = Math.max(
    pipeline.awaitingShipment,
    pipeline.collecting,
    pipeline.inTransit,
    pipeline.returns,
    pipeline.completedToday,
    1
  );

  return (
    <Card>
      <div className="p-4">
        <h3 className="text-base font-medium text-white mb-4">Воронка заказов</h3>
        <div className="space-y-3">
          {STAGES.map((stage, i) => {
            const value = pipeline[stage.key];
            const overdueKey = OVERDUE_KEYS[stage.key] as keyof typeof pipeline | undefined;
            const overdue = overdueKey ? (pipeline[overdueKey] as number) : 0;
            const percentage = Math.round((value / maxValue) * 100);

            const slaStatusKey = SLA_STATUS_MAP[stage.key];
            const slaHoursValue = slaStatusKey ? pipeline.slaHours?.[slaStatusKey] : null;

            return (
              <Link key={stage.key} href={stage.href} className="block group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {overdue > 0 && (
                      <span
                        className="text-2xs text-accent-orange font-medium"
                        title={
                          slaHoursValue
                            ? `Заказы в этом статусе дольше ${slaHoursValue}ч`
                            : undefined
                        }
                      >
                        {overdue} медл.
                      </span>
                    )}
                    <span className="text-sm font-semibold text-white">{value}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full"
                    style={{
                      backgroundColor: stage.color,
                      opacity: 0.7,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(percentage, 2)}%` }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.08 }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export function OrderPipelineCardSkeleton() {
  return (
    <Card>
      <div className="p-4 animate-pulse">
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex justify-between mb-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-6" />
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

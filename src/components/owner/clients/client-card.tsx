"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar, Badge, Skeleton } from "@/components/ui";
import type { ClientListItem } from "@/hooks/use-owner-clients";

interface ClientCardProps {
  client: ClientListItem;
  index?: number;
}

const TIER_LABELS: Record<string, string> = {
  none: "Free",
  basic: "Basic",
  premium: "Premium",
  top_floor_boss: "Top Boss",
};

const TIER_COLORS: Record<string, "default" | "success" | "warning" | "info"> = {
  none: "default",
  basic: "info",
  premium: "warning",
  top_floor_boss: "success",
};

const LEVEL_COLORS = [
  "text-white/60",
  "text-accent-blue",
  "text-accent-purple",
  "text-accent-orange",
];

export function ClientCard({ client, index = 0 }: ClientCardProps) {
  const debt = client.deposit && client.deposit < 0 ? Math.abs(client.deposit) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.005 }}
    >
      <Link
        href={`/owner/clients/${client.id}`}
        className="relative overflow-hidden block p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card hover:bg-white/[0.06] transition-colors"
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="flex items-start gap-4">
          <div className="ring-2 ring-white/[0.12] ring-offset-2 ring-offset-transparent rounded-full">
            <Avatar name={client.telegramUsername || client.name || "U"} size="md" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-white truncate">
                @{client.telegramUsername || "unknown"}
              </span>
              {client.isVibePlus && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/20 text-accent-orange border border-accent-orange/20">
                  +ВАЙБ
                </span>
              )}
              {client.isBlocked && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-accent-red border border-accent-red/20">
                  Заблокирован
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-white/60">
              <span className={LEVEL_COLORS[client.level || 0]}>Ур. {client.level || 0}</span>
              <Badge variant={TIER_COLORS[client.subscriptionTier || "none"]} size="sm">
                {TIER_LABELS[client.subscriptionTier || "none"]}
              </Badge>
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
              <span>{client.stats.orders} заказов</span>
              <span>{client.stats.revenue.toLocaleString("ru-RU")} ₽</span>
              {debt > 0 && (
                <span className="text-accent-red">Долг: {debt.toLocaleString("ru-RU")} ₽</span>
              )}
            </div>
          </div>

          <svg
            className="w-5 h-5 text-white/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>
    </motion.div>
  );
}

export function ClientCardSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card">
      <div className="flex items-start gap-4">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    </div>
  );
}

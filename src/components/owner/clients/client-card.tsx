"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/spinner";
import type { ClientListItem } from "@/hooks/use-owner-clients";

interface ClientCardProps {
  client: ClientListItem;
  index?: number;
}

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

export function ClientCard({ client, index = 0 }: ClientCardProps) {
  const debtOverLimit =
    client.vibeEnabled && client.vibeLimit > 0 && client.debt >= 0.9 * client.vibeLimit;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ scale: 1.005 }}
    >
      <Link
        href={`/owner/clients/${client.id}`}
        className="relative overflow-hidden block p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card hover:bg-white/[0.06] transition-colors"
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="flex items-start gap-4">
          <div className="ring-2 ring-white/[0.12] ring-offset-2 ring-offset-transparent rounded-full">
            <Avatar name={client.telegramUsername || client.name || "?"} size="md" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium text-white truncate">
                {client.name ||
                  (client.telegramUsername ? `@${client.telegramUsername}` : "Без имени")}
              </span>
              {client.vibeEnabled && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue border border-accent-blue/20">
                  +ВАЙБ
                </span>
              )}
              {client.isFrozen && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-orange/20 text-accent-orange border border-accent-orange/20">
                  Заморожен
                </span>
              )}
              {client.isBlocked && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-red/20 text-accent-red border border-accent-red/20">
                  Заблокирован
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-white/60">
              {client.telegramUsername ? (
                <span>@{client.telegramUsername}</span>
              ) : (
                <span className="text-white/40">tg:{client.tgUserId}</span>
              )}
              {client.phone && <span className="text-white/40">·</span>}
              {client.phone && <span>{client.phone}</span>}
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-white/40 flex-wrap">
              <span>{client.stats.orders} заказов</span>
              {client.stats.revenue > 0 && (
                <span className="text-accent-green">{formatRub(client.stats.revenue)}</span>
              )}
              {client.vibeEnabled && (
                <span
                  className={
                    debtOverLimit
                      ? "px-1.5 py-0.5 rounded-xl bg-accent-red/20 text-accent-red border border-accent-red/20 font-medium"
                      : client.debt > 0
                        ? "text-accent-orange"
                        : "text-white/40"
                  }
                >
                  Долг: {formatRub(client.debt)} / {formatRub(client.vibeLimit)}
                </span>
              )}
            </div>
          </div>

          <svg
            className="w-5 h-5 text-white/40 shrink-0"
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
    <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card">
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

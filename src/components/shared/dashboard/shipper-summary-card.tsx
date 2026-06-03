"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, Skeleton } from "@/components/ui";

interface ShipperSummaryCardProps {
  shippers: Array<{
    id: string;
    name: string;
    shippedToday: number;
    elo: number;
    pendingOrders: number;
  }>;
  totalShippedToday: number;
  pendingShipment: number;
}

function eloColor(value: number) {
  if (value >= 85) return { glow: "rgba(48,209,88,0.4)", glowSolid: "#30D158" };
  if (value >= 60) return { glow: "rgba(255,159,10,0.4)", glowSolid: "#FF9F0A" };
  return { glow: "rgba(255,69,58,0.4)", glowSolid: "#FF453A" };
}

function MiniEloTrack({ value }: { value: number }) {
  const colors = eloColor(value);
  const fillPercent = Math.min(Math.max(value, 0), 100);

  return (
    <div className="relative py-0.5 w-24 shrink-0">
      {fillPercent > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0 rounded-2xl"
          style={{
            background: `radial-gradient(ellipse at ${fillPercent / 2}% 50%, ${colors.glow}, transparent 60%)`,
            filter: "blur(8px)",
          }}
        />
      )}

      <div
        className="relative h-5 rounded-2xl overflow-hidden border border-white/[0.08]"
        style={{
          background: "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {fillPercent > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fillPercent}%` }}
            transition={{ duration: 0.9, ease: [0.25, 1, 0.5, 1] }}
            className="absolute inset-y-0 left-0"
            style={{
              background: `linear-gradient(to right, ${colors.glowSolid}10, ${colors.glowSolid}80)`,
            }}
          />
        )}

        <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold text-white/80">
          {value}
        </span>
      </div>
    </div>
  );
}

export function ShipperSummaryCard({
  shippers,
  totalShippedToday,
  pendingShipment,
}: ShipperSummaryCardProps) {
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-medium text-white">Сегодня на отправке</h3>
          <Link
            href="/owner/shippers"
            className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            Все →
          </Link>
        </div>

        <div className="flex items-baseline gap-1.5 mb-4">
          <span className="text-2xl font-bold text-white">{totalShippedToday}</span>
          <span className="text-sm text-white/60">отправлено</span>
          {pendingShipment > 0 && (
            <span className="text-sm text-white/30">· {pendingShipment} к отправке</span>
          )}
        </div>

        {shippers.length === 0 ? (
          <p className="text-sm text-white/40">Нет отправщиков</p>
        ) : (
          <div className="space-y-2">
            {shippers.slice(0, 5).map((shipper, index) => (
              <motion.div
                key={shipper.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  href={`/owner/shippers/${shipper.id}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-glass-minimal hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white truncate block">{shipper.name}</span>
                    <span className="text-2xs text-white/40">
                      {shipper.shippedToday} отпр.
                      {shipper.pendingOrders > 0 && (
                        <span className="text-accent-orange">
                          {" "}
                          · {shipper.pendingOrders} в очереди
                        </span>
                      )}
                    </span>
                  </div>

                  <MiniEloTrack value={shipper.elo} />
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function ShipperSummaryCardSkeleton() {
  return (
    <Card>
      <div className="p-4 animate-pulse">
        <div className="flex justify-between mb-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-8 w-20 mb-4" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04]"
            >
              <div>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-24 rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

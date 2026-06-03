"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Empty } from "@/components/ui";
import { cn } from "@/utils/cn";
import { OrderCard } from "@/components/shipper/order-card";
import { SelectAllRow } from "./select-all-row";
import { DELIVERY_SERVICE_LABELS, type ShipperOrder } from "@/hooks/use-shipper-orders";

/** Brand colors for delivery service section accents */
const SERVICE_COLORS: Record<string, { dot: string; text: string }> = {
  avito: { dot: "#00aaff", text: "text-[#00aaff]" },
  yandex: { dot: "#ffcc00", text: "text-yellow-400" },
  cdek: { dot: "#30d158", text: "text-[#30d158]" },
  pochta: { dot: "#5a9eff", text: "text-blue-400" },
  "5post": { dot: "#ff8533", text: "text-[#ff8533]" },
};

const FALLBACK_COLOR = { dot: "#ffffff80", text: "text-white/80" };

interface ShipTabProps {
  serviceGroups: Record<string, ShipperOrder[]>;
  totalCount: number;
  selectedIds: Set<string>;
  selectedCount: number;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onSelectGroup: (orders: ShipperOrder[]) => void;
}

export function ShipTab({
  serviceGroups,
  totalCount,
  selectedIds,
  selectedCount,
  onSelect,
  onSelectAll,
  onSelectGroup,
}: ShipTabProps) {
  if (totalCount === 0) {
    return (
      <Empty
        title="Нечего отправлять"
        description="Напечатайте стикеры на вкладке «Собрать» — заказы появятся тут"
        icon="🏷️"
      />
    );
  }

  const entries = Object.entries(serviceGroups);

  return (
    <>
      <SelectAllRow
        selectedCount={selectedCount}
        totalCount={totalCount}
        onSelectAll={onSelectAll}
      />

      {entries.map(([service, orders], gi) => {
        const allGroupSelected = orders.every((o) => selectedIds.has(o.id));
        const someGroupSelected = orders.some((o) => selectedIds.has(o.id));

        return (
          <motion.section
            key={service}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + gi * 0.05 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                className={cn(
                  "flex items-center gap-2.5 text-[15px] font-semibold uppercase tracking-wider",
                  (SERVICE_COLORS[service] || FALLBACK_COLOR).text
                )}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: (SERVICE_COLORS[service] || FALLBACK_COLOR).dot }}
                />
                {DELIVERY_SERVICE_LABELS[service] || service}
                <span className="text-sm font-normal text-white/40 normal-case tracking-normal">
                  ({orders.length})
                </span>
              </h2>
              <button
                onClick={() => onSelectGroup(orders)}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors",
                    allGroupSelected
                      ? "bg-accent-blue border-accent-blue"
                      : someGroupSelected
                        ? "border-accent-blue/50 bg-accent-blue/20"
                        : "border-white/25"
                  )}
                >
                  {allGroupSelected && (
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {someGroupSelected && !allGroupSelected && (
                    <div className="w-1.5 h-[1.5px] bg-accent-blue rounded-full" />
                  )}
                </div>
                Все
              </button>
            </div>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {orders.map((order, i) => (
                  <motion.div key={order.id} transition={{ delay: 0.15 + i * 0.03 }}>
                    <OrderCard
                      order={order}
                      variant="ship"
                      selected={selectedIds.has(order.id)}
                      onSelect={onSelect}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.section>
        );
      })}
    </>
  );
}

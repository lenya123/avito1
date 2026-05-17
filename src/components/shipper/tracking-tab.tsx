"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Empty } from "@/components/ui";
import { cn } from "@/utils/cn";
import { OrderCard } from "@/components/shipper/order-card";
import type { ShipperOrder } from "@/hooks/use-shipper-orders";

const TRACKING_SUB_FILTERS = [
  {
    value: "all",
    label: "Все",
    activeColor: "text-white",
    activeBorder: "border-white/30",
    activeBg: "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
  },
  {
    value: "in_transit",
    label: "В пути",
    activeColor: "text-accent-blue",
    activeBorder: "border-[rgba(10,132,255,0.4)]",
    activeBg:
      "bg-gradient-to-br from-[rgba(10,132,255,0.20)] via-[rgba(10,132,255,0.12)] to-[rgba(10,132,255,0.05)]",
  },
  {
    value: "delivered_to_point",
    label: "В ПВЗ",
    activeColor: "text-accent-green",
    activeBorder: "border-[rgba(48,209,88,0.4)]",
    activeBg:
      "bg-gradient-to-br from-[rgba(48,209,88,0.20)] via-[rgba(48,209,88,0.12)] to-[rgba(48,209,88,0.05)]",
  },
];

interface TrackingTabProps {
  orders: ShipperOrder[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onResetSelection: () => void;
  onStartReturn?: (orderId: string) => void;
}

export function TrackingTab({
  orders,
  selectedIds,
  onSelect,
  onResetSelection,
  onStartReturn,
}: TrackingTabProps) {
  const [subFilter, setSubFilter] = useState("all");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const filtered = useMemo(() => {
    if (subFilter === "all") return orders;
    return orders.filter((o) => o.status === subFilter);
  }, [orders, subFilter]);

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
        {TRACKING_SUB_FILTERS.map((tab) => {
          const count = tab.value === "all" ? orders.length : statusCounts[tab.value] || 0;
          return (
            <button
              key={tab.value}
              onClick={() => {
                setSubFilter(tab.value);
                onResetSelection();
              }}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap",
                "backdrop-blur-xl border transition-all duration-200",
                subFilter === tab.value
                  ? [
                      tab.activeBg,
                      tab.activeColor,
                      tab.activeBorder,
                      "shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]",
                    ]
                  : [
                      "bg-white/[0.06] text-white/70 border-white/15",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                      "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                    ]
              )}
            >
              {tab.label}
              {count > 0 && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Empty
          title={subFilter === "all" ? "Пока ничего в пути" : "Нет таких заказов"}
          description={
            subFilter === "all"
              ? "Отправьте заказы — они появятся тут с трекингом"
              : `Нет заказов со статусом «${TRACKING_SUB_FILTERS.find((t) => t.value === subFilter)?.label}»`
          }
          icon="🚚"
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((order, index) => (
              <motion.div key={order.id} transition={{ delay: index * 0.03 }}>
                <OrderCard
                  order={order}
                  variant="tracking"
                  selected={selectedIds.has(order.id)}
                  onSelect={onSelect}
                  onStartReturn={onStartReturn}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

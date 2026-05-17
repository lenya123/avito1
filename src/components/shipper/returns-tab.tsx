"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Empty } from "@/components/ui";
import { OrderCard } from "@/components/shipper/order-card";
import { SelectAllRow } from "./select-all-row";
import type { ShipperOrder } from "@/hooks/use-shipper-orders";

interface ReturnsTabProps {
  orders: ShipperOrder[];
  selectedIds: Set<string>;
  selectedCount: number;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onDispute: (orderId: string, orderNumber: number) => void;
}

export function ReturnsTab({
  orders,
  selectedIds,
  selectedCount,
  onSelect,
  onSelectAll,
  onDispute,
}: ReturnsTabProps) {
  // Sort: return_arrived first (ready to pick up), return_in_transit last
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      if (a.status === "return_arrived" && b.status !== "return_arrived") return -1;
      if (a.status !== "return_arrived" && b.status === "return_arrived") return 1;
      return 0;
    });
  }, [orders]);

  if (orders.length === 0) {
    return (
      <Empty
        title="Возвратов нет"
        description="Отлично! Все посылки дошли до покупателей"
        icon="🎉"
      />
    );
  }

  const arrivedCount = sortedOrders.filter((o) => o.status === "return_arrived").length;
  const inTransitCount = sortedOrders.filter((o) => o.status === "return_in_transit").length;

  return (
    <>
      <SelectAllRow
        selectedCount={selectedCount}
        totalCount={orders.length}
        onSelectAll={onSelectAll}
      />
      <div className="space-y-3">
        {arrivedCount > 0 && inTransitCount > 0 && (
          <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-accent-orange uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-accent-orange" />
            Прибыли ({arrivedCount})
          </h2>
        )}
        <AnimatePresence mode="popLayout">
          {sortedOrders.map((order, i) => (
            <motion.div key={order.id} transition={{ delay: 0.15 + i * 0.03 }}>
              {i === arrivedCount && arrivedCount > 0 && inTransitCount > 0 && (
                <h2 className="flex items-center gap-2 text-sm font-semibold text-accent-teal uppercase tracking-wider mb-3 mt-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-teal" />В пути (
                  {inTransitCount})
                </h2>
              )}
              <OrderCard
                order={order}
                variant="returns"
                selected={selectedIds.has(order.id)}
                onSelect={onSelect}
                onDispute={onDispute}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

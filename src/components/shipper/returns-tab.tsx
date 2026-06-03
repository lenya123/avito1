"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Empty } from "@/components/ui";
import { OrderCard } from "@/components/shipper/order-card";
import { SelectAllRow } from "./select-all-row";
import { TrumpetButton } from "./trumpet-button";
import type { ShipperOrder } from "@/hooks/use-shipper-orders";

interface ReturnsTabProps {
  orders: ShipperOrder[];
  selectedIds: Set<string>;
  selectedCount: number;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onDispute: (orderId: string, orderNumber: number) => void;
  onPickupResult?: (
    orderId: string,
    result: "picked_up" | "wrong_code" | "wrong_tracking" | "not_found"
  ) => void;
}

export function ReturnsTab({
  orders,
  selectedIds,
  selectedCount,
  onSelect,
  onSelectAll,
  onDispute,
  onPickupResult,
}: ReturnsTabProps) {
  // Канон §4.2/§6.4: в табе «Возвраты» только статус `return` (один пул).
  // Разделение «в пути / на ПВЗ» по expected_return_date — фаза 3 (§11.3).
  if (orders.length === 0) {
    return (
      <>
        <div className="mb-3">
          <TrumpetButton disabled />
        </div>
        <Empty
          title="Возвратов нет"
          description="Отлично! Все посылки дошли до покупателей"
          icon="🎉"
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-3">
        <TrumpetButton />
      </div>
      <SelectAllRow
        selectedCount={selectedCount}
        totalCount={orders.length}
        onSelectAll={onSelectAll}
      />
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {orders.map((order, i) => (
            <motion.div key={order.id} transition={{ delay: 0.15 + i * 0.03 }}>
              <OrderCard
                order={order}
                variant="returns"
                selected={selectedIds.has(order.id)}
                onSelect={onSelect}
                onDispute={onDispute}
                onPickupResult={onPickupResult}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Empty } from "@/components/ui";
import { cn } from "@/utils/cn";
import { OrderCard } from "@/components/shipper/order-card";
import { DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";
import type { ShipperOrder } from "@/hooks/use-shipper-orders";
import type { StockProductSize } from "@/hooks/use-shipper-stock";

type GroupMode = "priority" | "product" | "service";

const GROUP_MODES: { value: GroupMode; label: string }[] = [
  { value: "priority", label: "Приоритет" },
  { value: "product", label: "Товар" },
  { value: "service", label: "СД" },
];

interface CollectTabProps {
  urgentOrders: ShipperOrder[];
  normalOrders: ShipperOrder[];
  problemOrders: ShipperOrder[];
  totalCount: number;
  selectedIds: Set<string>;
  selectedCount: number;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  stockSizesMap: Map<string, StockProductSize[]>;
  onSetSize: (orderId: string, size: string, productSizeId: string) => void;
}

/** Group orders by product name, sorted by group size desc. Within each group, sort by size. */
function groupByProduct(orders: ShipperOrder[]): { label: string; orders: ShipperOrder[] }[] {
  const map = new Map<string, ShipperOrder[]>();
  for (const order of orders) {
    const key = order.product?.name || "Без товара";
    const list = map.get(key) || [];
    list.push(order);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, groupOrders]) => ({
      label: `${label} (${groupOrders.length})`,
      orders: groupOrders.sort((a, b) => (a.size || "").localeCompare(b.size || "")),
    }));
}

/** Group orders by delivery service */
function groupByService(orders: ShipperOrder[]): { label: string; orders: ShipperOrder[] }[] {
  const map = new Map<string, ShipperOrder[]>();
  for (const order of orders) {
    const key = order.delivery_service;
    const list = map.get(key) || [];
    list.push(order);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([service, groupOrders]) => ({
      label: `${DELIVERY_SERVICE_LABELS[service] || service} (${groupOrders.length})`,
      orders: groupOrders,
    }));
}

export function CollectTab({
  urgentOrders,
  normalOrders,
  problemOrders,
  totalCount,
  selectedIds,
  selectedCount,
  onSelect,
  onSelectAll,
  stockSizesMap,
  onSetSize,
}: CollectTabProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>("priority");

  const allOrders = useMemo(
    () => [...problemOrders, ...urgentOrders, ...normalOrders],
    [problemOrders, urgentOrders, normalOrders]
  );

  const altGroups = useMemo(() => {
    if (groupMode === "product") return groupByProduct(allOrders);
    if (groupMode === "service") return groupByService(allOrders);
    return [];
  }, [groupMode, allOrders]);

  if (totalCount === 0) {
    return (
      <Empty
        title="Всё собрано!"
        description="Новые заказы появятся здесь автоматически — можно отдохнуть"
        icon="☕"
      />
    );
  }

  const renderCard = (order: ShipperOrder, delay: number) => (
    <motion.div key={order.id} transition={{ delay }}>
      <OrderCard
        order={order}
        variant="collect"
        selected={selectedIds.has(order.id)}
        onSelect={onSelect}
        availableSizes={order.product?.id ? stockSizesMap.get(order.product.id) : undefined}
        onSetSize={onSetSize}
      />
    </motion.div>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onSelectAll}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <div
            className={cn(
              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
              selectedCount === totalCount && totalCount > 0
                ? "bg-accent-blue border-accent-blue"
                : "border-white/30"
            )}
          >
            {selectedCount === totalCount && totalCount > 0 && (
              <svg
                className="w-3 h-3 text-white"
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
          </div>
          Выбрать все
        </button>

        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="text-sm text-accent-blue mr-1">{selectedCount}</span>
          )}
          <div className="flex gap-0.5 bg-white/[0.06] rounded-xl p-0.5">
            {GROUP_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setGroupMode(mode.value)}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-medium rounded-[10px] transition-all",
                  groupMode === mode.value
                    ? "bg-white/15 text-white"
                    : "text-white/40 active:text-white/60"
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {groupMode === "priority" ? (
        <>
          {problemOrders.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              <h2 className="flex items-center gap-2.5 text-base font-bold text-accent-red mb-3 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-accent-red" />
                Проблемы ({problemOrders.length})
              </h2>
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {problemOrders.map((order, i) => renderCard(order, 0.15 + i * 0.03))}
                </AnimatePresence>
              </div>
            </motion.section>
          )}

          {urgentOrders.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-accent-orange mb-3 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-orange" />
                Срочные ({urgentOrders.length})
              </h2>
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {urgentOrders.map((order, i) => renderCard(order, 0.2 + i * 0.03))}
                </AnimatePresence>
              </div>
            </motion.section>
          )}

          {normalOrders.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#0a84ff] mb-3 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]" />
                Обычные ({normalOrders.length})
              </h2>
              <div className="space-y-2.5">
                <AnimatePresence mode="popLayout">
                  {normalOrders.map((order, i) => renderCard(order, 0.25 + i * 0.03))}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </>
      ) : (
        altGroups.map((group, gi) => (
          <motion.section
            key={group.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + gi * 0.05 }}
          >
            <h2 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wider">
              {group.label}
            </h2>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {group.orders.map((order, i) => renderCard(order, 0.15 + gi * 0.05 + i * 0.03))}
              </AnimatePresence>
            </div>
          </motion.section>
        ))
      )}
    </>
  );
}

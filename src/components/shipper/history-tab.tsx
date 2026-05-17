"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Empty } from "@/components/ui";
import { OrderCard, OrderCardSkeleton } from "@/components/shipper/order-card";
import { useShipperHistoryOrders, type ShipperOrder } from "@/hooks/use-shipper-orders";
import { cn } from "@/utils/cn";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 50;

export function HistoryTab() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isFetching } = useShipperHistoryOrders(
    debouncedSearch,
    offset,
    PAGE_SIZE
  );
  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setOffset(0);
  }, []);

  const handleNextPage = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handlePrevPage = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Noop — history cards are not selectable
  const noop = useCallback(() => {}, []);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Номер заказа или трек-номер..."
          className={cn(
            "w-full pl-10 pr-4 py-2.5 rounded-xl",
            "bg-white/[0.08] backdrop-blur-sm",
            "border border-glass",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
            "text-white text-sm placeholder:text-white/40",
            "focus:outline-none focus:border-white/30 focus:bg-white/[0.12]",
            "transition-colors"
          )}
        />
        {search && (
          <button
            onClick={() => handleSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Total count */}
      {total > 0 && (
        <div className="text-[11px] text-white/40">
          {debouncedSearch ? `Найдено: ${total}` : `Всего: ${total}`}
          {total > PAGE_SIZE && (
            <span className="ml-1">
              (стр. {Math.floor(offset / PAGE_SIZE) + 1} из {Math.ceil(total / PAGE_SIZE)})
            </span>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Empty
          title={debouncedSearch ? "Ничего не найдено" : "История пуста"}
          description={
            debouncedSearch
              ? "Попробуйте другой номер заказа или трек-номер"
              : "Завершённые заказы будут отображаться здесь"
          }
          icon={debouncedSearch ? "🔍" : "📋"}
        />
      ) : (
        <>
          <div
            className={cn("space-y-3", isFetching && !isLoading && "opacity-60 transition-opacity")}
          >
            <AnimatePresence mode="popLayout">
              {orders.map((order: ShipperOrder, i: number) => (
                <motion.div key={order.id} transition={{ delay: i * 0.02 }}>
                  <OrderCard order={order} variant="history" selected={false} onSelect={noop} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Pagination */}
          {(hasPrev || hasMore) && (
            <div className="flex justify-center gap-3 pt-2">
              {hasPrev && (
                <button
                  onClick={handlePrevPage}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium",
                    "bg-white/[0.06] border border-glass text-white/70",
                    "hover:bg-white/[0.10] hover:text-white transition-colors"
                  )}
                >
                  Назад
                </button>
              )}
              {hasMore && (
                <button
                  onClick={handleNextPage}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium",
                    "bg-white/[0.06] border border-glass text-white/70",
                    "hover:bg-white/[0.10] hover:text-white transition-colors"
                  )}
                >
                  Дальше
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

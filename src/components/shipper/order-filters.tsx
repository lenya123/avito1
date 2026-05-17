"use client";

import { cn } from "@/utils/cn";

export type OrderFilter = "collect" | "ship" | "tracking" | "returns" | "history";

interface FilterConfig {
  value: OrderFilter;
  label: string;
  icon?: string;
}

const FILTERS: FilterConfig[] = [
  { value: "collect", label: "Собрать" },
  { value: "ship", label: "Отправить" },
  { value: "tracking", label: "В пути" },
  { value: "returns", label: "Возвраты" },
  { value: "history", label: "История" },
];

/** Маппинг фильтров на статусы заказов */
export const FILTER_STATUSES: Record<OrderFilter, string[]> = {
  collect: ["awaiting_shipment", "collecting", "problem"],
  ship: ["collecting"],
  tracking: ["in_transit", "delivered_to_point", "not_picked_up"],
  returns: ["return_in_transit", "return_arrived"],
  history: ["completed", "return_completed", "cancelled", "disposed", "trash"],
};

interface OrderFiltersProps {
  active: OrderFilter;
  onChange: (filter: OrderFilter) => void;
  counts?: Partial<Record<OrderFilter, number>>;
}

export function OrderFilters({ active, onChange, counts }: OrderFiltersProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
      {FILTERS.map((filter) => {
        const isActive = active === filter.value;
        const count = counts?.[filter.value];

        return (
          <button
            key={filter.value}
            onClick={() => onChange(filter.value)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex-shrink-0",
              "backdrop-blur-xl border transition-all duration-200",
              isActive
                ? [
                    "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                    "text-white border-white/30",
                    "shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]",
                  ]
                : [
                    "bg-white/[0.06] text-white/70 border-white/15",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                    "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                  ]
            )}
          >
            {filter.value === "history" && (
              <svg
                className="w-3.5 h-3.5 inline-block mr-1 -mt-px"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            {filter.label}
            {count !== undefined && count > 0 && (
              <span className="ml-1.5 text-xs opacity-60">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

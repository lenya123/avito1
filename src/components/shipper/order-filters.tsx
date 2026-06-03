"use client";

import { cn } from "@/utils/cn";

/**
 * Имена фильтров оставлены legacy для совместимости с существующими
 * UI-компонентами; смысл переопределён под новую модель (BUSINESS_LOGIC §4.4):
 *   collect  — общий пул paid + problem.
 *   ship     — collecting (мои взятые в работу: захват + опц. печать + сдача в ПВЗ).
 *   returns  — return.
 *   history  — sent / return_done / cancelled / trash.
 *
 * Дальше Phase E.2 (опц.) — переименовать collect→pool, ship→mine для ясности.
 */
export type OrderFilter = "collect" | "ship" | "returns" | "history";

interface FilterConfig {
  value: OrderFilter;
  label: string;
  icon?: string;
}

const FILTERS: FilterConfig[] = [
  { value: "collect", label: "Общий пул" },
  { value: "ship", label: "В работе" },
  { value: "returns", label: "Возвраты" },
  { value: "history", label: "История" },
];

/** Маппинг фильтров на статусы заказов (BUSINESS_LOGIC §4.4).
 *
 * collect: общий пул `paid` + `problem` с `problem_type='bad_barcode'` —
 * отправщик ждёт нового трека от клиента, держит карточку у себя.
 * `problem` с `problem_type='out_of_stock'` тут НЕ показывается: разрулится
 * автоматом (`auto-resume-problem` при поступлении возврата) или сгорит
 * по `send_by` (см. handler `expire-send-by`). Дополнительная фильтрация
 * по problem_type выполняется на клиенте в page.tsx.
 */
export const FILTER_STATUSES: Record<OrderFilter, string[]> = {
  collect: ["paid", "problem"],
  ship: ["collecting"],
  returns: ["return"],
  history: ["sent", "return_done", "cancelled", "trash"],
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

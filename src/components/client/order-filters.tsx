"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/hooks/use-orders";
import { Button, DatePicker } from "@/components/ui";

// Конвертация ISO (yyyy-mm-dd) → Display (dd.mm.yyyy)
const isoToDisplay = (isoDate: string): string => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
};

// Конвертация Display (dd.mm.yyyy) → ISO (yyyy-mm-dd)
const displayToIso = (displayDate: string): string => {
  if (!displayDate) return "";
  const [day, month, year] = displayDate.split(".");
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
};

/** ISO-дата YYYY-MM-DD из Date */
const toISODate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export type OrderFilterState = {
  status: OrderStatus | "";
  dateFrom: string;
  dateTo: string;
  period: "all" | "day" | "week" | "month" | "custom" | "";
};

export interface OrderFiltersProps {
  filters: OrderFilterState;
  onChange: (filters: OrderFilterState) => void;
  className?: string;
}

const PERIOD_OPTIONS = [
  { value: "all", label: "Все время" },
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
];

// Фильтруем статусы для отображения (основные)
const DISPLAY_STATUSES: OrderStatus[] = [
  "awaiting_shipment",
  "collecting",
  "in_transit",
  "completed",
  "return_in_transit",
  "return_arrived",
  "return_completed",
  "cancelled",
];

export function OrderFilters({ filters, onChange, className }: OrderFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePeriodChange = useCallback(
    (period: OrderFilterState["period"]) => {
      const now = new Date();
      const today = toISODate(now);
      let dateFrom = "";
      let dateTo = "";

      switch (period) {
        case "day": {
          const d = new Date(now);
          d.setDate(d.getDate() - 13); // Последние 14 дней (включая сегодня)
          dateFrom = toISODate(d);
          dateTo = today;
          break;
        }
        case "week": {
          const d = new Date(now);
          d.setDate(d.getDate() - 83); // ~12 недель
          dateFrom = toISODate(d);
          dateTo = today;
          break;
        }
        case "month": {
          const d = new Date(now);
          d.setMonth(d.getMonth() - 11); // 12 месяцев включая текущий
          d.setDate(1); // Начало того месяца
          dateFrom = toISODate(d);
          dateTo = today;
          break;
        }
        case "custom":
          dateFrom = filters.dateFrom;
          dateTo = filters.dateTo;
          break;
        default:
          // "all" — без ограничений
          dateFrom = "";
          dateTo = "";
      }

      onChange({ ...filters, period, dateFrom, dateTo });
    },
    [filters, onChange]
  );

  const handleStatusChange = useCallback(
    (status: OrderStatus | "") => {
      onChange({ ...filters, status });
    },
    [filters, onChange]
  );

  const handleDateChange = useCallback(
    (field: "dateFrom" | "dateTo", value: string) => {
      onChange({ ...filters, [field]: value, period: "custom" });
    },
    [filters, onChange]
  );

  const handleReset = useCallback(() => {
    onChange({ status: "", dateFrom: "", dateTo: "", period: "all" });
  }, [onChange]);

  const hasActiveFilters = filters.status || (filters.period && filters.period !== "all");

  return (
    <div className={cn("space-y-3", className)}>
      {/* Быстрые фильтры по периоду */}
      <div className="flex items-center gap-1.5">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => handlePeriodChange(option.value as OrderFilterState["period"])}
            className={cn(
              "px-2.5 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap",
              "backdrop-blur-xl border transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
              filters.period === option.value
                ? [
                    "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                    "text-white border-glass-strong",
                    "shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_rgba(94,92,230,0.15),inset_0_1px_0_rgba(255,255,255,0.2)]",
                  ]
                : [
                    "bg-white/[0.06] text-white/60 border-glass-subtle",
                    "shadow-glass-inset",
                    "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                  ]
            )}
          >
            {option.label}
          </button>
        ))}

        {/* Кнопка расширенных фильтров */}
        <Button
          variant={isExpanded ? "primary" : "secondary"}
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label="Фильтры"
          className={cn(
            "relative px-2.5 py-1.5",
            !isExpanded && "bg-white/10 text-white border border-glass hover:bg-white/15"
          )}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-blue text-white text-xs font-bold rounded-full flex items-center justify-center">
              !
            </span>
          )}
        </Button>

        {/* Сброс фильтров */}
        {hasActiveFilters && (
          <button
            onClick={handleReset}
            className="px-2 py-1.5 text-xs font-medium rounded-xl text-white/40 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl"
          >
            ✕
          </button>
        )}
      </div>

      {/* Расширенные фильтры */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "p-4 rounded-2xl space-y-4",
                "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                "border border-glass",
                "shadow-card"
              )}
            >
              {/* Фильтр по статусу */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Статус</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleStatusChange("")}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                      "shadow-glass-inset",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                      filters.status === ""
                        ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                        : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                    )}
                  >
                    Все
                  </button>
                  {DISPLAY_STATUSES.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
                        "shadow-glass-inset",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                        filters.status === status
                          ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                          : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/25"
                      )}
                    >
                      {ORDER_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Выбрать период */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Выбрать период
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker
                    label="От"
                    value={isoToDisplay(filters.dateFrom)}
                    onChange={(displayDate) =>
                      handleDateChange("dateFrom", displayToIso(displayDate))
                    }
                    placeholder="дд.мм.гггг"
                  />
                  <DatePicker
                    label="До"
                    value={isoToDisplay(filters.dateTo)}
                    onChange={(displayDate) =>
                      handleDateChange("dateTo", displayToIso(displayDate))
                    }
                    placeholder="дд.мм.гггг"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

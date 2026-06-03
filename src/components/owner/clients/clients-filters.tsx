"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDebounce } from "@/hooks/use-debounce";
import { Input, Button } from "@/components/ui";
import { cn } from "@/utils/cn";
import type { ClientsFilters } from "@/hooks/use-owner-clients";

interface ClientsFiltersProps {
  filters: ClientsFilters;
  onChange: (filters: ClientsFilters) => void;
}

const VIBE_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "enabled", label: "+ВАЙБ" },
  { value: "disabled", label: "Без +ВАЙБ" },
] as const;

const FROZEN_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "no", label: "Активные" },
  { value: "yes", label: "Заморожены" },
] as const;

const BLOCKED_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "no", label: "Активные" },
  { value: "yes", label: "Заблокированы" },
] as const;

const SORT_OPTIONS = [
  { value: "created_at", label: "Дата" },
  { value: "orders", label: "Заказы" },
  { value: "revenue", label: "Выручка" },
  { value: "debt", label: "Долг" },
] as const;

const NATURAL_ORDER: Record<string, "asc" | "desc"> = {
  created_at: "desc",
  orders: "desc",
  revenue: "desc",
  debt: "desc",
};

export function ClientsFiltersComponent({ filters, onChange }: ClientsFiltersProps) {
  const [search, setSearch] = useState(filters.search || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const update = useCallback(
    (patch: Partial<ClientsFilters>) => {
      onChange({ ...filters, ...patch, page: 1 });
    },
    [filters, onChange]
  );

  useEffect(() => {
    if (debouncedSearch !== (filters.search || "")) {
      update({ search: debouncedSearch || undefined });
    }
  }, [debouncedSearch, filters.search, update]);

  const advancedCount = [
    filters.vibe && filters.vibe !== "all",
    filters.frozen && filters.frozen !== "all",
    filters.blocked && filters.blocked !== "all",
  ].filter(Boolean).length;

  const hasAnyFilter =
    !!filters.search || (filters.sort && filters.sort !== "created_at") || advancedCount > 0;

  const handleReset = () => {
    setSearch("");
    onChange({ page: 1 });
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Поиск по имени, @username или телефону..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {SORT_OPTIONS.map((opt) => {
          const isActive = (filters.sort || "created_at") === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => {
                if (isActive) {
                  update({ order: filters.order === "desc" ? "asc" : "desc" });
                } else {
                  update({
                    sort: opt.value as ClientsFilters["sort"],
                    order: NATURAL_ORDER[opt.value] || "desc",
                  });
                }
              }}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap flex items-center gap-1.5",
                "backdrop-blur-xl border transition-all duration-200",
                isActive
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
              {opt.label}
              {isActive && (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={filters.order === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
                  />
                </svg>
              )}
            </button>
          );
        })}

        <Button
          variant={showAdvanced ? "primary" : "secondary"}
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-label="Фильтры"
          className={cn(
            "relative px-2.5 py-1.5",
            !showAdvanced && "bg-white/10 text-white border border-glass hover:bg-white/15"
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
          {advancedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-blue text-white text-xs font-bold rounded-full flex items-center justify-center">
              {advancedCount}
            </span>
          )}
        </Button>

        {hasAnyFilter && (
          <button
            onClick={handleReset}
            className="px-2 py-1.5 text-xs font-medium rounded-xl text-white/40 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "p-4 rounded-2xl space-y-4",
                "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                "border border-glass shadow-card"
              )}
            >
              <FilterGroup
                label="+ВАЙБ-кредит"
                options={VIBE_OPTIONS}
                value={filters.vibe || "all"}
                onChange={(v) => update({ vibe: v as ClientsFilters["vibe"] })}
              />
              <FilterGroup
                label="Заморозка"
                options={FROZEN_OPTIONS}
                value={filters.frozen || "all"}
                onChange={(v) => update({ frozen: v as ClientsFilters["frozen"] })}
              />
              <FilterGroup
                label="Блокировка"
                options={BLOCKED_OPTIONS}
                value={filters.blocked || "all"}
                onChange={(v) => update({ blocked: v as ClientsFilters["blocked"] })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FilterGroupProps {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

function FilterGroup({ label, options, value, onChange }: FilterGroupProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/60 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-xl backdrop-blur-sm border transition-all duration-200",
              "shadow-glass-inset",
              value === opt.value
                ? "bg-white/[0.18] text-white border-glass-strong shadow-card"
                : "bg-white/[0.08] text-white/60 border-glass hover:text-white hover:bg-white/[0.12] hover:border-white/20"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

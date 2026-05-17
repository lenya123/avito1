"use client";

import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui";
import { cn } from "@/utils/cn";
import type { ClientsFilters } from "@/hooks/use-owner-clients";

interface ClientsFiltersProps {
  filters: ClientsFilters;
  onChange: (filters: ClientsFilters) => void;
}

export function ClientsFiltersComponent({ filters, onChange }: ClientsFiltersProps) {
  const [search, setSearch] = useState(filters.search || "");
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onChange({ ...filters, search: debouncedSearch, page: 1 });
    }
  }, [debouncedSearch]);

  const handleFilterChange = (key: keyof ClientsFilters, value: string | number) => {
    onChange({ ...filters, [key]: value, page: 1 });
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <Input
        placeholder="Поиск по @username, имени, email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        }
      />

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Status */}
        <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04]">
          {[
            { value: "all", label: "Все" },
            { value: "active", label: "Активные" },
            { value: "blocked", label: "Заблокированные" },
            { value: "vibe_plus", label: "+ВАЙБ" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleFilterChange("status", option.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                (filters.status || "all") === option.value
                  ? "bg-white/[0.12] text-white shadow-glass-inset"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Tier */}
        <select
          value={filters.tier || "all"}
          onChange={(e) => handleFilterChange("tier", e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        >
          <option value="all">Все тарифы</option>
          <option value="none">Free</option>
          <option value="basic">Basic</option>
          <option value="premium">Premium</option>
          <option value="top_floor_boss">Top Boss</option>
        </select>

        {/* Level */}
        <select
          value={filters.level !== undefined ? filters.level.toString() : ""}
          onChange={(e) =>
            handleFilterChange(
              "level",
              e.target.value ? parseInt(e.target.value) : (undefined as unknown as number)
            )
          }
          className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        >
          <option value="">Все уровни</option>
          <option value="0">Уровень 0</option>
          <option value="1">Уровень 1</option>
          <option value="2">Уровень 2</option>
          <option value="3">Уровень 3</option>
        </select>

        {/* Sort */}
        <select
          value={filters.sort || "created_at"}
          onChange={(e) => handleFilterChange("sort", e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        >
          <option value="created_at">По дате регистрации</option>
          <option value="deposit">По депозиту</option>
        </select>

        {/* Order */}
        <button
          onClick={() => handleFilterChange("order", filters.order === "desc" ? "asc" : "desc")}
          className="p-2 rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
          title={filters.order === "desc" ? "По убыванию" : "По возрастанию"}
        >
          {filters.order === "desc" ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

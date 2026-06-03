/**
 * Segmented control «Все / Дроп / Авито» (ТЗ §7.1).
 * Используется в шапке /owner/analytics и /owner/finance.
 */

"use client";

import { cn } from "@/utils/cn";

export type Channel = "all" | "drop" | "avito";

interface ChannelToggleProps {
  value: Channel;
  onChange: (v: Channel) => void;
  className?: string;
}

const OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: "all", label: "Все" },
  { value: "drop", label: "Дроп" },
  { value: "avito", label: "Авито" },
];

export function ChannelToggle({ value, onChange, className }: ChannelToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-lg",
        "bg-white/[0.05] border border-glass-minimal",
        className
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-all",
              active
                ? "bg-accent-blue text-white shadow-sm"
                : "text-white/60 hover:text-white hover:bg-white/[0.06]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

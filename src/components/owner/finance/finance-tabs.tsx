"use client";

import { cn } from "@/utils/cn";

export type FinanceTab = "expenses" | "payouts" | "debts";

interface FinanceTabsProps {
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
  /** Опционально ограничить набор вкладок. По умолчанию — все 3. */
  allowedTabs?: FinanceTab[];
}

export function FinanceTabs({ active, onChange, allowedTabs }: FinanceTabsProps) {
  const tabs: { key: FinanceTab; label: string }[] = [
    { key: "expenses", label: "Расходы" },
    { key: "payouts", label: "Выплаты" },
    { key: "debts", label: "Касса" },
  ];
  const visible = allowedTabs ? tabs.filter((t) => allowedTabs.includes(t.key)) : tabs;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
      {visible.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap",
            active === tab.key
              ? "bg-white/[0.12] text-white border border-glass-active shadow-glass-inset"
              : "text-white/60 hover:text-white hover:bg-white/[0.06]"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

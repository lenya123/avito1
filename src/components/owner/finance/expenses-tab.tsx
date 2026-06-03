"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, Card } from "@/components/ui";
import { useDeleteExpense } from "@/hooks/use-owner-finance";
import { cn } from "@/utils/cn";
import type { ExpenseCategory, FinanceData } from "@/hooks/use-owner-finance";

const ACCENT_HEX: Record<string, string> = {
  "accent-orange": "#FF9F0A",
  "accent-blue": "#0A84FF",
  "accent-green": "#30D158",
  "accent-red": "#FF453A",
  "accent-purple": "#BF5AF2",
  "accent-pink": "#FF375F",
  "accent-teal": "#64D2FF",
  "accent-indigo": "#5E5CE6",
};

interface ExpensesTabProps {
  expenses: FinanceData["expenses"];
  categories: ExpenseCategory[];
  totalExpenses: number;
  onAddExpense: () => void;
}

export function ExpensesTab({
  expenses,
  categories,
  totalExpenses,
  onAddExpense,
}: ExpensesTabProps) {
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const deleteExpense = useDeleteExpense();

  const filtered = filterCategory
    ? expenses.filter((e) => e.category === filterCategory)
    : expenses;

  const getCategoryColor = (categoryName: string): string => {
    const cat = categories.find((c) => c.name === categoryName);
    return cat?.color || "accent-orange";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">Всего: {totalExpenses.toLocaleString("ru-RU")} ₽</p>
        <Button variant="primary" size="sm" onClick={onAddExpense}>
          + Расход
        </Button>
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setFilterCategory(null)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 whitespace-nowrap",
              filterCategory === null
                ? "bg-white/[0.12] text-white border border-glass-active shadow-glass-inset"
                : "text-white/60 bg-white/[0.04] border border-glass hover:bg-white/[0.06]"
            )}
          >
            Все
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(filterCategory === cat.name ? null : cat.name)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 whitespace-nowrap",
                filterCategory === cat.name
                  ? "bg-white/[0.12] text-white border border-glass-active shadow-glass-inset"
                  : "text-white/60 bg-white/[0.04] border border-glass hover:bg-white/[0.06]"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Expense list */}
      {filtered.length === 0 ? (
        <Card>
          <p className="text-center text-white/40 py-6">Нет расходов за период</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e, i) => {
            const colorToken = getCategoryColor(e.category);
            const hex = ACCENT_HEX[colorToken] || "#FF9F0A";

            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <div
                  className={cn(
                    "p-3 rounded-2xl",
                    "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                    "border border-glass shadow-card"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Category dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: hex, boxShadow: `0 0 4px 0 ${hex}40` }}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{e.category}</p>
                      {e.description && (
                        <p className="text-xs text-white/40 mt-0.5 truncate">{e.description}</p>
                      )}
                    </div>

                    {/* Amount + date */}
                    <div className="text-right shrink-0">
                      <p className="text-sm text-accent-orange font-medium">
                        -{e.amount.toLocaleString("ru-RU")} ₽
                      </p>
                      <p className="text-2xs text-white/20">
                        {e.date ? new Date(e.date).toLocaleDateString("ru-RU") : ""}
                      </p>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteExpense.mutate(e.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-accent-red hover:bg-accent-red/10 transition-colors shrink-0"
                      title="Удалить"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M11 4v7.5a1 1 0 01-1 1H4a1 1 0 01-1-1V4" />
                      </svg>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

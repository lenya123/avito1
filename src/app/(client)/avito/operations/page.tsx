"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { BackButton, Spinner } from "@/components/ui";
import { useAvitoOperations } from "@/hooks/use-avito";
import { OperationRow } from "@/components/client/avito/operation-row";

const PERIOD_OPTIONS = [
  { label: "7д", days: 7 },
  { label: "14д", days: 14 },
  { label: "30д", days: 30 },
] as const;

export default function AvitoOperationsPage() {
  const [periodDays, setPeriodDays] = useState(30);

  const from = useMemo(
    () => new Date(Date.now() - periodDays * 86400000).toISOString(),
    [periodDays]
  );
  const to = useMemo(() => new Date().toISOString(), [periodDays]);

  const { data, isLoading } = useAvitoOperations(from, to);

  const operations = data?.result?.operations ?? [];
  const total = data?.result?.total ?? 0;

  const { totalIncome, totalExpenses } = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const op of operations) {
      if (op.amount_rub >= 0) {
        income += op.amount_rub;
      } else {
        expenses += op.amount_rub;
      }
    }
    return { totalIncome: income, totalExpenses: expenses };
  }, [operations]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/avito" />
        <h1 className="text-xl font-bold text-white">Операции</h1>
      </motion.div>

      {/* Period filter */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-2 mb-4"
      >
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            onClick={() => setPeriodDays(opt.days)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-sm font-medium transition-colors",
              periodDays === opt.days
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/30"
                : "bg-white/[0.06] text-white/60 border border-glass-minimal hover:bg-white/[0.10] hover:text-white/80"
            )}
          >
            {opt.label}
          </button>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : operations.length > 0 ? (
        <>
          {/* Summary card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={cn(
              "rounded-2xl p-4 mb-4",
              "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
              "backdrop-blur-xl border border-glass shadow-card"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 mb-1">Доход</p>
                <p className="text-lg font-semibold text-accent-green">
                  +{totalIncome.toLocaleString("ru")} ₽
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/40 mb-1">Расходы</p>
                <p className="text-lg font-semibold text-accent-red">
                  {totalExpenses.toLocaleString("ru")} ₽
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-glass-minimal flex items-center justify-between">
              <span className="text-xs text-white/40">Всего операций</span>
              <span className="text-sm font-medium text-white/60">{total}</span>
            </div>
          </motion.div>

          {/* Operations list */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={cn(
              "rounded-2xl px-4",
              "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
              "backdrop-blur-xl border border-glass shadow-card"
            )}
          >
            {operations.map((op, index) => (
              <motion.div
                key={op.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.03 }}
              >
                <OperationRow
                  operationName={op.operation_name}
                  datetime={op.datetime}
                  amountRub={op.amount_rub}
                  amountBonus={op.amount_bonus}
                  serviceName={op.service_name}
                />
              </motion.div>
            ))}
          </motion.div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-2xl p-12 text-center",
            "bg-white/[0.06] backdrop-blur-xl",
            "border border-glass-minimal"
          )}
        >
          <div className="text-4xl mb-3">💰</div>
          <p className="text-white/40 text-sm">Операций пока нет</p>
        </motion.div>
      )}
    </main>
  );
}

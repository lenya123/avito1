"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/utils/cn";
import { useAvitoOperations } from "@/hooks/use-avito";
import { OperationRow } from "@/components/client/avito/operation-row";
export function DashboardOperations() {
  const router = useRouter();
  const { data: operationsData, isLoading, isError } = useAvitoOperations();

  const operations = useMemo(
    () => operationsData?.result?.operations?.slice(0, 5) ?? [],
    [operationsData]
  );

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

  if (isError || isLoading || operations.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Операции</h2>
        <button
          onClick={() => router.push("/avito/operations")}
          className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          Все →
        </button>
      </div>

      {/* Income / Expenses summary */}
      <div className="flex items-center gap-4 mb-3 text-sm">
        <span className="text-accent-green font-medium">+{totalIncome.toLocaleString("ru")} ₽</span>
        <span className="text-white/20">·</span>
        <span className="text-accent-red font-medium">{totalExpenses.toLocaleString("ru")} ₽</span>
      </div>

      <div
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="divide-y divide-white/[0.06]">
          {operations.map((op) => (
            <div key={op.id}>
              <OperationRow
                operationName={op.operation_name}
                datetime={op.datetime}
                amountRub={op.amount_rub}
                amountBonus={op.amount_bonus}
                serviceName={op.service_name}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

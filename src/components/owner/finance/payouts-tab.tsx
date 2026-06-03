"use client";

import { motion } from "framer-motion";
import { Button, Card } from "@/components/ui";
import { useDeletePayout } from "@/hooks/use-owner-finance";
import { cn } from "@/utils/cn";
import type { FinanceData } from "@/hooks/use-owner-finance";

interface PayoutsTabProps {
  payouts: FinanceData["payouts"];
  totalPayouts: number;
  onAddPayout?: () => void;
  /** Read-only mode (seller view): no add/delete buttons. */
  readOnly?: boolean;
}

export function PayoutsTab({
  payouts,
  totalPayouts,
  onAddPayout,
  readOnly = false,
}: PayoutsTabProps) {
  const deletePayout = useDeletePayout();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">
          Всего выплат: {totalPayouts.toLocaleString("ru-RU")} ₽
        </p>
        {!readOnly && onAddPayout && (
          <Button variant="primary" size="sm" onClick={onAddPayout}>
            + Выплата
          </Button>
        )}
      </div>

      {payouts.length === 0 ? (
        <Card>
          <p className="text-center text-white/40 py-6">Нет выплат за период</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {payouts.map((p, i) => (
            <motion.div
              key={p.id}
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">
                      Шиппер #{p.shipperId.slice(0, 8)}
                    </p>
                    {p.note && <p className="text-xs text-white/40 mt-0.5 truncate">{p.note}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-accent-blue font-medium">
                      -{p.amount.toLocaleString("ru-RU")} ₽
                    </p>
                    <p className="text-2xs text-white/20">
                      {p.date ? new Date(p.date).toLocaleDateString("ru-RU") : ""}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => deletePayout.mutate(p.id)}
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
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

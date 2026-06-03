"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, CardContent, CardHeader, Modal, Skeleton } from "@/components/ui";
import { useFullBalanceHistory, type BalanceHistoryEntry } from "@/hooks/use-owner-clients";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : "−";
  return sign + new Intl.NumberFormat("ru-RU").format(Math.abs(n)) + " ₽";
}

// Человекочитаемые лейблы для reason. Полный список — в миграциях
// supabase/migrations/202605*_balance_history_*.sql.
const REASON_LABELS: Record<string, string> = {
  return_done: "Возврат принят",
  cancelled_before_ship: "Отмена до отправки",
  send_by_expired: "send_by сгорел",
  manual_credit: "Ручное пополнение",
  manual_debit: "Ручное списание",
  withdrawal: "Вывод (списание)",
  withdrawal_request: "Запрос вывода",
  withdrawal_cancel: "Отмена вывода",
  withdrawal_rejected: "Отказ в выводе",
  overpayment_credit: "Возврат переплаты",
  mismatch_credit: "Возврат несовпадения",
  balance_apply: "Применено к заказу",
  balance_return: "Возврат на баланс",
  partner_refund_credit: "Возврат от партнёра",
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

function HistoryRow({ entry }: { entry: BalanceHistoryEntry }) {
  const positive = entry.delta > 0;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-glass last:border-b-0">
      <div
        className={`text-base font-bold min-w-[100px] ${
          positive ? "text-accent-green" : "text-accent-red"
        }`}
      >
        {formatDelta(entry.delta)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-white">{reasonLabel(entry.reason)}</span>
          {entry.orderNumber != null && (
            <span className="text-white/60">· заказ №{entry.orderNumber}</span>
          )}
          {entry.actorName && <span className="text-white/60">· {entry.actorName}</span>}
        </div>
        {entry.note && <p className="text-xs text-white/60 mt-0.5">«{entry.note}»</p>}
        <p className="text-xs text-white/40 mt-0.5">
          {new Date(entry.createdAt).toLocaleString("ru-RU")}
        </p>
      </div>
      <div className="text-xs text-white/40 text-right shrink-0">
        баланс: {formatRub(entry.balanceAfter)}
      </div>
    </div>
  );
}

interface Props {
  customerId: string;
  recentHistory: BalanceHistoryEntry[];
}

const FULL_PAGE_LIMIT = 50;

// Секция «История движений баланса» + модалка с полной историей
// (пагинация). На странице — последние 5 (приходят из main GET endpoint).
// Полная история подгружается лениво только при открытии модалки.
export function BalanceHistorySection({ customerId, recentHistory }: Props) {
  const [showFull, setShowFull] = useState(false);
  const [offset, setOffset] = useState(0);

  const fullQuery = useFullBalanceHistory(customerId, FULL_PAGE_LIMIT, offset, showFull);

  const closeModal = () => {
    setShowFull(false);
    setOffset(0);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="font-semibold text-white">История движений баланса</h3>
          {recentHistory.length > 0 && (
            <button
              onClick={() => setShowFull(true)}
              className="text-sm text-accent-blue hover:text-accent-blue/80"
            >
              Показать всю →
            </button>
          )}
        </CardHeader>
        <CardContent>
          {recentHistory.length === 0 ? (
            <p className="text-white/60 text-center py-4">Движений баланса пока не было.</p>
          ) : (
            <div className="space-y-0">
              {recentHistory.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={showFull} onClose={closeModal} title="Полная история движений баланса">
        <div className="space-y-4">
          {fullQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          )}
          {fullQuery.error && (
            <p className="text-accent-red text-sm">
              Ошибка загрузки: {(fullQuery.error as Error).message}
            </p>
          )}
          {fullQuery.data && fullQuery.data.items.length === 0 && (
            <p className="text-white/60 text-center py-4">Записей нет.</p>
          )}
          {fullQuery.data && fullQuery.data.items.length > 0 && (
            <>
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                {fullQuery.data.items.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-glass">
                <p className="text-xs text-white/50">
                  {offset + 1}–{Math.min(offset + FULL_PAGE_LIMIT, fullQuery.data.total)} из{" "}
                  {fullQuery.data.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - FULL_PAGE_LIMIT))}
                  >
                    ← Назад
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={offset + FULL_PAGE_LIMIT >= fullQuery.data.total}
                    onClick={() => setOffset(offset + FULL_PAGE_LIMIT)}
                  >
                    Дальше →
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </motion.div>
  );
}

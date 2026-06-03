"use client";

import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui";
import { useAdjustClientBalance } from "@/hooks/use-owner-clients";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

type Mode = "credit" | "debit";

interface BalanceControlsProps {
  customerId: string;
  customerBalance: number;
  onChanged?: () => void;
}

// Блок «Баланс клиента (копилка)» + кнопки ➕ Пополнить / ➖ Списать с
// модалками. Используется в +ВАЙБ-card на /owner/clients/[id].
export function BalanceControls({ customerId, customerBalance, onChanged }: BalanceControlsProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const adjust = useAdjustClientBalance(customerId);

  const handleClose = () => {
    setMode(null);
    setAmount("");
    setNote("");
    adjust.reset();
  };

  const handleApply = () => {
    if (!mode) return;
    const num = Number(amount);
    if (!isFinite(num) || num <= 0) return;
    const trimmedNote = note.trim();
    if (trimmedNote.length === 0) return;
    const delta = mode === "credit" ? num : -num;
    adjust.mutate(
      { delta, note: trimmedNote },
      {
        onSuccess: () => {
          handleClose();
          onChanged?.();
        },
      }
    );
  };

  const modalTitle = mode === "credit" ? "Пополнить баланс клиента" : "Списать с баланса клиента";
  const buttonLabel = mode === "credit" ? "Пополнить" : "Списать";
  const buttonVariant = mode === "credit" ? "primary" : "danger";

  return (
    <>
      <div>
        <p className="text-xs text-white/40 mb-1">Баланс (копилка)</p>
        <p className="text-xl font-bold text-white mb-3">{formatRub(customerBalance)}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setMode("credit");
              setAmount("");
              setNote("");
            }}
          >
            ➕ Пополнить
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setMode("debit");
              setAmount("");
              setNote("");
            }}
            disabled={customerBalance <= 0}
          >
            ➖ Списать
          </Button>
        </div>
        {customerBalance <= 0 && (
          <p className="text-xs text-white/30 mt-2">Списать нечего — баланс пустой.</p>
        )}
      </div>

      <Modal isOpen={mode !== null} onClose={handleClose} title={modalTitle}>
        <div className="space-y-4">
          <Input
            label="Сумма (₽)"
            type="number"
            min="1"
            step="1"
            placeholder="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div>
            <label className="text-xs text-white/60 block mb-1">
              Комментарий <span className="text-accent-red">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={
                mode === "credit"
                  ? "Например: извинения за задержку, бонус, ручной возврат"
                  : "Например: ошибочное пополнение, корректировка"
              }
              className="w-full rounded-xl bg-white/[0.04] border border-glass px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-glass-active resize-none"
            />
            <p className="text-xs text-white/40 mt-1">Останется в истории движений баланса.</p>
          </div>
          {adjust.error && (
            <p className="text-sm text-accent-red">{(adjust.error as Error).message}</p>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={handleClose}>
              Отмена
            </Button>
            <Button
              variant={buttonVariant}
              onClick={handleApply}
              isLoading={adjust.isPending}
              disabled={!amount || Number(amount) <= 0 || note.trim().length === 0}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

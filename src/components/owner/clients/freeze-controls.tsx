"use client";

import { useState } from "react";
import { Button, Modal, Input } from "@/components/ui";

interface FreezeControlsProps {
  customerId: string;
  vibeEnabled: boolean;
  isFrozen: boolean;
  currentDebt: number;
  requiredPaymentAmount: number | null;
  frozenReason: string | null;
  onChanged: () => void;
}

export function FreezeControls({
  customerId,
  vibeEnabled,
  isFrozen,
  currentDebt,
  requiredPaymentAmount,
  frozenReason,
  onChanged,
}: FreezeControlsProps) {
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [requireFullDebt, setRequireFullDebt] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!vibeEnabled) return null;

  const handleFreeze = async () => {
    setError(null);
    setLoading(true);
    try {
      const requiredPaymentAmount = requireFullDebt ? null : Number(amountInput.replace(",", "."));
      if (
        !requireFullDebt &&
        (!Number.isFinite(requiredPaymentAmount) || (requiredPaymentAmount as number) <= 0)
      ) {
        throw new Error("Введите корректную сумму");
      }
      const res = await fetch(`/api/owner/customers/${customerId}/freeze`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requiredPaymentAmount,
          reason: reasonInput.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ошибка заморозки");
      }
      setShowFreezeModal(false);
      setAmountInput("");
      setReasonInput("");
      setRequireFullDebt(true);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnfreeze = async () => {
    if (!confirm("Разморозить клиента? Поле required_payment_amount будет очищено.")) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/customers/${customerId}/unfreeze`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ошибка разморозки");
      }
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isFrozen ? (
        <Button variant="secondary" size="sm" onClick={handleUnfreeze} disabled={loading}>
          🔓 Разморозить
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowFreezeModal(true)}
          disabled={loading}
        >
          🔒 Заморозить
        </Button>
      )}

      {error && <span className="text-xs text-accent-red">{error}</span>}

      {isFrozen && requiredPaymentAmount != null && (
        <span className="text-xs text-white/60">
          Нужно оплатить более {requiredPaymentAmount.toLocaleString("ru-RU")} ₽
          {frozenReason ? ` · ${frozenReason}` : ""}
        </span>
      )}

      <Modal
        isOpen={showFreezeModal}
        onClose={() => setShowFreezeModal(false)}
        title="Заморозить с требованием оплаты"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Текущий долг клиента:{" "}
            <span className="font-semibold text-white">
              {currentDebt.toLocaleString("ru-RU")} ₽
            </span>
          </p>

          <p className="text-xs text-white/50">
            Клиент гасит долг конкретными заказами — суммы могут не сходиться с заданным порогом.
            Разморозка сработает когда клиент оплатит больше указанной суммы (или весь долг).
          </p>

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={requireFullDebt}
              onChange={(e) => setRequireFullDebt(e.target.checked)}
            />
            Требовать оплатить весь долг
          </label>

          {!requireFullDebt && (
            <Input
              label="Порог: оплатить больше чем (₽)"
              type="number"
              min={1}
              max={currentDebt > 0 ? currentDebt : undefined}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="например: 10000"
            />
          )}

          <Input
            label="Причина (необязательно)"
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
            placeholder="например: Просрочка по предыдущим заказам"
          />

          {error && <p className="text-sm text-accent-red">{error}</p>}

          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowFreezeModal(false)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={handleFreeze} disabled={loading}>
              {loading ? "Замораживаем…" : "Заморозить"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

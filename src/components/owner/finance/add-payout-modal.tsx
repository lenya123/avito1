"use client";

import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui";
import { useCreatePayout } from "@/hooks/use-owner-finance";
import { useOwnerShippers } from "@/hooks/use-owner-shippers";
import { cn } from "@/utils/cn";

interface AddPayoutModalProps {
  onClose: () => void;
}

export function AddPayoutModal({ onClose }: AddPayoutModalProps) {
  const [amount, setAmount] = useState("");
  const [shipperId, setShipperId] = useState("");
  const [note, setNote] = useState("");
  const createPayout = useCreatePayout();
  const { data: shippersData } = useOwnerShippers();

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0 || !shipperId) return;
    try {
      await createPayout.mutateAsync({
        shipperId,
        amount: Number(amount),
        note: note || undefined,
      });
      onClose();
    } catch {
      // error shown via mutation state
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Выплата шипперу">
      <div className="space-y-4">
        <div>
          <label className="text-sm text-white/60 mb-1 block">Шиппер</label>
          <select
            value={shipperId}
            onChange={(e) => setShipperId(e.target.value)}
            className={cn(
              "w-full px-3 py-2.5 rounded-xl text-sm text-white",
              "bg-white/[0.06] border border-glass",
              "focus:outline-none focus:ring-2 focus:ring-accent-blue"
            )}
          >
            <option value="">Выберите шиппера</option>
            {shippersData?.shippers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.telegramUsername || s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-white/60 mb-1 block">Сумма</label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>

        <div>
          <label className="text-sm text-white/60 mb-1 block">Примечание</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Опционально" />
        </div>

        {createPayout.error && (
          <p className="text-sm text-accent-red">{createPayout.error.message}</p>
        )}

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleSubmit}
            isLoading={createPayout.isPending}
          >
            Выплатить
          </Button>
        </div>
      </div>
    </Modal>
  );
}

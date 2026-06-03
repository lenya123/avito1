"use client";

import { useState, useEffect } from "react";
import { cn } from "@/utils/cn";
import { Modal, ModalFooter, Button } from "@/components/ui";
import { useUpdateItemPrice } from "@/hooks/use-avito";

interface PriceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  avitoItemId: number | null;
  currentPrice: number | null;
  itemTitle?: string;
}

export function PriceEditModal({
  isOpen,
  onClose,
  avitoItemId,
  currentPrice,
  itemTitle,
}: PriceEditModalProps) {
  const [newPrice, setNewPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const updatePrice = useUpdateItemPrice();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setNewPrice(currentPrice ? String(currentPrice) : "");
      setError(null);
      updatePrice.reset();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!avitoItemId) return;

    const parsed = parseInt(newPrice, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 999999999) {
      setError("Введите корректную цену (от 1 до 999 999 999)");
      return;
    }

    setError(null);

    try {
      await updatePrice.mutateAsync({ itemId: avitoItemId, price: parsed });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления цены");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Изменить цену"
      description={itemTitle}
      size="sm"
    >
      <div className="space-y-4">
        {/* Current price */}
        {currentPrice !== null && (
          <div>
            <label className="text-xs text-white/40 block mb-1">Текущая цена</label>
            <div
              className={cn(
                "px-3 py-2.5 rounded-xl text-sm text-white/60",
                "bg-white/[0.04] border border-glass-minimal"
              )}
            >
              {currentPrice.toLocaleString("ru")} ₽
            </div>
          </div>
        )}

        {/* New price input */}
        <div>
          <label className="text-xs text-white/60 block mb-1">Новая цена</label>
          <div className="relative">
            <input
              type="number"
              value={newPrice}
              onChange={(e) => {
                setNewPrice(e.target.value);
                setError(null);
              }}
              min={1}
              max={999999999}
              placeholder="Введите цену"
              className={cn(
                "w-full px-3 py-2.5 pr-8 rounded-xl text-sm text-white placeholder-white/30",
                "bg-white/[0.06] border border-glass-minimal",
                "focus:outline-none focus:border-accent-blue/50",
                "transition-colors",
                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              )}
              autoFocus
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
              ₽
            </span>
          </div>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={updatePrice.isPending}>
          Отмена
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!newPrice.trim() || updatePrice.isPending}
        >
          {updatePrice.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button, Input, Modal } from "@/components/ui";
import { cn } from "@/utils/cn";
import { useUpdateShipper } from "@/hooks/use-owner-shippers";
import { type ShipperListItem } from "@/hooks/use-owner-shippers";

const DAY_LABELS: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  0: "Вс",
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface EditShipperModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipper: ShipperListItem;
}

export function EditShipperModal({ isOpen, onClose, shipper }: EditShipperModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    telegramUsername: "",
    phone: "",
  });
  const [workDays, setWorkDays] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateShipper = useUpdateShipper();

  useEffect(() => {
    if (isOpen && shipper) {
      setFormData({
        name: shipper.name || "",
        telegramUsername: shipper.telegramUsername || "",
        phone: shipper.phone || "",
      });
      setWorkDays(shipper.workDays || []);
      setErrors({});
    }
  }, [isOpen, shipper]);

  function toggleDay(day: number) {
    setWorkDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Введите имя";
    if (formData.name.trim().length < 2) newErrors.name = "Имя минимум 2 символа";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await updateShipper.mutateAsync({
        shipperId: shipper.id,
        name: formData.name.trim(),
        telegramUsername: formData.telegramUsername.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        workDays: workDays.length > 0 ? workDays : undefined,
      });

      onClose();
    } catch (error) {
      if (error instanceof Error) {
        setErrors({ submit: error.message });
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Редактировать отправщика">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Имя"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          placeholder="Иван Иванов"
        />

        <Input
          label="Telegram (опционально)"
          value={formData.telegramUsername}
          onChange={(e) => setFormData({ ...formData, telegramUsername: e.target.value })}
          placeholder="username"
        />

        <Input
          label="Телефон (опционально)"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="+7 999 123-45-67"
        />

        {/* Work days */}
        <div>
          <label className="text-sm text-white/60 mb-2 block">Рабочие дни</label>
          <div className="flex gap-1.5">
            {DAY_ORDER.map((day) => {
              const isActive = workDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium transition-all border",
                    isActive
                      ? "bg-accent-blue/20 text-accent-blue border-accent-blue/40"
                      : "bg-white/[0.04] text-white/40 border-glass hover:bg-white/[0.08]"
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>
          {workDays.length > 0 && (
            <p className="text-2xs text-white/40 mt-1">Выбрано: {workDays.length}</p>
          )}
        </div>

        {errors.submit && <p className="text-sm text-accent-red">{errors.submit}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Отмена
          </Button>
          <Button type="submit" isLoading={updateShipper.isPending} className="flex-1">
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui";
import { useCreateShipper } from "@/hooks/use-owner-shippers";

interface CreateShipperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateShipperModal({ isOpen, onClose }: CreateShipperModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    telegramUsername: "",
    phone: "",
    login: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createShipper = useCreateShipper();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Валидация
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Введите имя";
    if (!formData.login.trim()) newErrors.login = "Введите логин";
    if (formData.login.length < 3) newErrors.login = "Логин минимум 3 символа";
    if (!formData.password) newErrors.password = "Введите пароль";
    if (formData.password.length < 6) newErrors.password = "Пароль минимум 6 символов";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await createShipper.mutateAsync({
        name: formData.name.trim(),
        telegramUsername: formData.telegramUsername.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        login: formData.login.trim(),
        password: formData.password,
      });

      setFormData({ name: "", telegramUsername: "", phone: "", login: "", password: "" });
      onClose();
    } catch (error) {
      if (error instanceof Error) {
        setErrors({ submit: error.message });
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Добавить отправщика">
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

        <div className="border-t border-glass pt-4">
          <p className="text-sm text-white/60 mb-3">Данные для входа в приложение</p>

          <Input
            label="Логин"
            value={formData.login}
            onChange={(e) => setFormData({ ...formData, login: e.target.value })}
            error={errors.login}
            placeholder="shipper1"
          />

          <Input
            label="Пароль"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            error={errors.password}
            placeholder="Минимум 6 символов"
            className="mt-4"
          />
        </div>

        {errors.submit && <p className="text-sm text-accent-red">{errors.submit}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Отмена
          </Button>
          <Button type="submit" isLoading={createShipper.isPending} className="flex-1">
            Добавить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

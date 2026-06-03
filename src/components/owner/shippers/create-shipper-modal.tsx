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
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createShipper = useCreateShipper();

  function handleClose() {
    setFormData({ name: "", telegramUsername: "", phone: "" });
    setErrors({});
    setGeneratedKey(null);
    setCopied(false);
    onClose();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Введите имя";
    if (!formData.telegramUsername.trim()) newErrors.telegramUsername = "Telegram обязателен";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const result = await createShipper.mutateAsync({
        name: formData.name.trim(),
        telegramUsername: formData.telegramUsername.trim(),
        phone: formData.phone.trim() || undefined,
      });

      setGeneratedKey(result.shipper.siteKey);
    } catch (error) {
      if (error instanceof Error) {
        setErrors({ submit: error.message });
      }
    }
  };

  async function handleCopy() {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Success state — show generated key
  if (generatedKey) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Отправщик добавлен">
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-accent-green/10 border border-accent-green/20">
            <p className="text-sm text-accent-green font-medium mb-1">
              {formData.name} успешно добавлен
            </p>
            <p className="text-xs text-white/50">
              Отправьте ключ отправщику — он нужен для входа в приложение
            </p>
          </div>

          <div>
            <label className="text-sm text-white/60 mb-2 block">Ключ для входа</label>
            <div className="relative">
              <div className="p-3 rounded-xl bg-white/[0.04] border border-glass font-mono text-xs text-white/80 break-all select-all leading-relaxed">
                {generatedKey}
              </div>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] transition-colors"
              >
                {copied ? (
                  <svg
                    className="w-4 h-4 text-accent-green"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4 text-white/60"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-white/40">
            Отправщик вводит этот ключ на странице входа. Ключ генерируется один раз и привязан к
            профилю.
          </p>

          <Button onClick={handleClose} className="w-full">
            Готово
          </Button>
        </div>
      </Modal>
    );
  }

  // Form state
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Добавить отправщика">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Имя"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          placeholder="Иван Иванов"
        />

        <Input
          label="Telegram"
          value={formData.telegramUsername}
          onChange={(e) => setFormData({ ...formData, telegramUsername: e.target.value })}
          error={errors.telegramUsername}
          placeholder="username"
        />

        <Input
          label="Телефон (опционально)"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="+7 999 123-45-67"
        />

        {errors.submit && <p className="text-sm text-accent-red">{errors.submit}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} className="flex-1">
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

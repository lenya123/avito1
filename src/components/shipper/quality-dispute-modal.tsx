"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Modal, Button, Input } from "@/components/ui";
import { cn } from "@/utils/cn";

interface QualityDisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (photos: string[], reason: string) => Promise<void>;
  orderNumber: number;
  isLoading: boolean;
}

export function QualityDisputeModal({
  isOpen,
  onClose,
  onSubmit,
  orderNumber,
  isLoading,
}: QualityDisputeModalProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = 5 - photos.length;
    const filesToProcess = Array.from(files).slice(0, remaining);

    filesToProcess.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name}: файл больше 5 МБ`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos((prev) => {
          if (prev.length >= 5) return prev;
          return [...prev, reader.result as string];
        });
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (photos.length === 0) return;
    await onSubmit(photos, reason);
    setPhotos([]);
    setReason("");
  };

  const handleClose = () => {
    onClose();
    setPhotos([]);
    setReason("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal isOpen={isOpen} onClose={handleClose} title="Проблема с качеством">
          <div className="space-y-4">
            <p className="text-white/70 text-sm">
              Заказ #{orderNumber}. Сфотографируйте товар, чтобы зафиксировать несоответствие
              качества. Клиенту будет отправлено уведомление, депозит не будет возвращён.
            </p>

            {/* Превью фото */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative aspect-square rounded-xl overflow-hidden bg-secondary"
                  >
                    <Image src={photo} alt={`Фото ${i + 1}`} fill className="object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Кнопка загрузки */}
            {photos.length < 5 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-full p-4 rounded-xl border-2 border-dashed border-white/20",
                  "flex flex-col items-center gap-2",
                  "text-white/50 hover:text-white/70 hover:border-white/30",
                  "transition-colors"
                )}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="text-sm">Добавить фото ({photos.length}/5)</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Причина */}
            <Input
              label="Описание проблемы (опционально)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: товар повреждён, пятна на ткани..."
            />

            {/* Кнопки */}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={handleClose}>
                Отмена
              </Button>
              <Button
                variant="primary"
                className="flex-1 !bg-accent-red hover:!bg-accent-red/80"
                onClick={handleSubmit}
                isLoading={isLoading}
                disabled={photos.length === 0}
              >
                Отправить спор
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}

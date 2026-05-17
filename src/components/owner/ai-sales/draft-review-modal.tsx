"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui";
import type { AiSalesDraft } from "@/hooks/use-ai-sales";

interface DraftReviewModalProps {
  draft: AiSalesDraft | null;
  onClose: () => void;
  onSubmit: (draftId: string, editedText: string, correctionType: string) => void;
  isLoading: boolean;
}

const CORRECTION_TYPES = [
  { value: "tone", label: "Тон" },
  { value: "factual", label: "Факт" },
  { value: "pricing", label: "Цена" },
  { value: "sizing", label: "Размер" },
  { value: "urgency", label: "Срочность" },
  { value: "other", label: "Другое" },
];

export function DraftReviewModal({ draft, onClose, onSubmit, isLoading }: DraftReviewModalProps) {
  const [editedText, setEditedText] = useState(draft?.originalDraft || "");
  const [correctionType, setCorrectionType] = useState("other");

  // Синхронизация при открытии нового черновика
  if (draft && editedText === "" && draft.originalDraft) {
    setEditedText(draft.originalDraft);
  }

  return (
    <AnimatePresence>
      {draft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full max-w-lg max-h-[90vh] overflow-y-auto",
              "rounded-t-3xl p-5",
              "bg-gradient-to-b from-secondary to-primary",
              "border border-glass border-b-0",
              "shadow-glass"
            )}
          >
            {/* Хэндл */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <h3 className="text-lg font-semibold text-white mb-4">Редактирование ответа</h3>

            {/* Сообщение покупателя */}
            <div className="mb-4 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle">
              <p className="text-xs text-white/40 mb-1">Покупатель:</p>
              <p className="text-sm text-white/80">{draft.buyerMessage}</p>
            </div>

            {/* Textarea для правки */}
            <div className="mb-4">
              <label className="text-xs text-white/40 mb-2 block">Ваш ответ:</label>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={5}
                className={cn(
                  "w-full p-3 rounded-xl text-sm text-white/80",
                  "bg-white/[0.06] border border-glass",
                  "focus:border-white/30 focus-visible:ring-2 focus-visible:ring-accent-blue focus:outline-none",
                  "resize-none placeholder-white/30"
                )}
                placeholder="Введите ответ покупателю..."
              />
            </div>

            {/* Тип правки */}
            <div className="mb-5">
              <label className="text-xs text-white/40 mb-2 block">Тип правки:</label>
              <div className="flex flex-wrap gap-2">
                {CORRECTION_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => setCorrectionType(ct.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                      correctionType === ct.value
                        ? "bg-accent-purple/30 text-accent-purple/80 border border-accent-purple/40"
                        : "bg-white/[0.06] text-white/40 border border-glass-subtle"
                    )}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-3">
              <Button
                onClick={() => onSubmit(draft.id, editedText, correctionType)}
                disabled={!editedText.trim()}
                isLoading={isLoading}
                className="flex-1"
              >
                Отправить
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Отмена
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

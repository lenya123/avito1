"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui";

interface ReviewCardProps {
  id: number;
  score: number; // 1-5
  senderName: string;
  text: string;
  created: number; // Unix timestamp (seconds)
  itemTitle?: string;
  answer?: { id: number; text: string; created: number };
  onReply: (reviewId: number, text: string) => void;
  onDeleteAnswer?: (answerId: number) => void;
  isReplying?: boolean;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={cn("w-4 h-4", filled ? "text-accent-orange" : "text-white/20")}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function formatRelativeDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewCard({
  id,
  score,
  senderName,
  text,
  created,
  itemTitle,
  answer,
  onReply,
  onDeleteAnswer,
  isReplying = false,
}: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");

  const handleSubmitReply = () => {
    if (!replyText.trim()) return;
    onReply(id, replyText.trim());
    setReplyText("");
    setShowReplyForm(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Header: stars + sender + date */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <StarIcon key={i} filled={i < score} />
            ))}
          </div>
          <span className="text-sm font-medium text-white">{senderName}</span>
        </div>
        <span className="text-xs text-white/40">{formatRelativeDate(created)}</span>
      </div>

      {/* Item title */}
      {itemTitle && <p className="text-xs text-accent-blue mb-2 truncate">{itemTitle}</p>}

      {/* Review text */}
      <div className="relative">
        <p className={cn("text-sm text-white/80 leading-relaxed", !expanded && "line-clamp-3")}>
          {text}
        </p>
        {text.length > 150 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-accent-blue mt-1 hover:text-accent-blue/80 transition-colors"
          >
            Показать полностью
          </button>
        )}
      </div>

      {/* Existing answer */}
      {answer && (
        <div className="mt-3 bg-white/[0.04] rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-white/60">Ваш ответ</span>
            <span className="text-xs text-white/40">{formatRelativeDate(answer.created)}</span>
          </div>
          <p className="text-sm text-white/60 leading-relaxed">{answer.text}</p>
          {onDeleteAnswer && (
            <button
              onClick={() => onDeleteAnswer(answer.id)}
              className="text-xs text-accent-red mt-2 hover:text-accent-red/80 transition-colors"
            >
              Удалить ответ
            </button>
          )}
        </div>
      )}

      {/* Reply button / form */}
      {!answer && (
        <div className="mt-3">
          {!showReplyForm ? (
            <button
              onClick={() => setShowReplyForm(true)}
              className="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors font-medium"
            >
              Ответить
            </button>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Напишите ответ..."
                  rows={3}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/30",
                    "bg-white/[0.06] border border-glass-minimal",
                    "focus:outline-none focus:border-accent-blue/50",
                    "resize-none transition-colors"
                  )}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSubmitReply}
                    disabled={!replyText.trim() || isReplying}
                    isLoading={isReplying}
                  >
                    Отправить
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowReplyForm(false);
                      setReplyText("");
                    }}
                  >
                    Отмена
                  </Button>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </motion.div>
  );
}

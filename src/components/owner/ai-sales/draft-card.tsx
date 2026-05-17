"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui";
import type { AiSalesDraft } from "@/hooks/use-ai-sales";

interface DraftCardProps {
  draft: AiSalesDraft;
  index: number;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (draft: AiSalesDraft) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Ожидает", color: "text-accent-orange", bg: "bg-yellow-500/20" },
  approved: { label: "Одобрен", color: "text-accent-green", bg: "bg-green-500/20" },
  rejected: { label: "Отклонён", color: "text-accent-red", bg: "bg-red-500/20" },
  expired: { label: "Истёк", color: "text-white/40", bg: "bg-white/[0.06]" },
  auto_sent: { label: "Авто", color: "text-accent-blue", bg: "bg-blue-500/20" },
};

function ConfidenceIndicator({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const color =
    pct >= 85 ? "text-accent-green" : pct >= 65 ? "text-accent-orange" : "text-accent-red";

  return <span className={cn("text-xs font-medium", color)}>{pct}%</span>;
}

export function DraftCard({ draft, index, onApprove, onReject, onEdit }: DraftCardProps) {
  const status = STATUS_CONFIG[draft.status] || STATUS_CONFIG.pending;
  const timeAgo = getTimeAgo(draft.generatedAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative p-4 rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      {/* Верхняя полоса */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-purple/30 to-transparent" />

      {/* Заголовок: статус + время + confidence */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn("px-2 py-0.5 rounded-full text-xs font-medium", status.bg, status.color)}
          >
            {status.label}
          </span>
          <ConfidenceIndicator value={draft.confidence} />
        </div>
        <span className="text-xs text-white/40">{timeAgo}</span>
      </div>

      {/* Сообщение покупателя */}
      <div className="mb-3 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle">
        <p className="text-xs text-white/40 mb-1">Покупатель:</p>
        <p className="text-sm text-white/80 line-clamp-3">{draft.buyerMessage}</p>
      </div>

      {/* Черновик AI */}
      <div className="mb-3 p-3 rounded-xl bg-accent-purple/[0.06] border border-accent-purple/20">
        <p className="text-xs text-accent-purple/70 mb-1">AI черновик:</p>
        <p className="text-sm text-white/80 line-clamp-4">
          {draft.editedDraft || draft.originalDraft}
        </p>
      </div>

      {/* Мета */}
      {draft.generationTimeMs && (
        <div className="flex items-center gap-3 mb-3 text-xs text-white/20">
          <span>{draft.generationTimeMs}мс</span>
          {draft.tokensUsed && <span>{draft.tokensUsed} токенов</span>}
        </div>
      )}

      {/* Кнопки (только для pending) */}
      {draft.status === "pending" && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onApprove(draft.id)}
            className="flex-1 bg-green-500/20 text-accent-green border-green-500/30 hover:bg-green-500/30"
          >
            Отправить
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit(draft)} className="flex-1">
            Изменить
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReject(draft.id)}
            className="text-accent-red/70 hover:text-accent-red hover:bg-red-500/10"
          >
            &times;
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} д`;
}

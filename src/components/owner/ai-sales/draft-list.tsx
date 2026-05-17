"use client";

import { useState } from "react";
import { cn } from "@/utils/cn";
import { Empty } from "@/components/ui";
import { DraftCard } from "./draft-card";
import { DraftReviewModal } from "./draft-review-modal";
import {
  useAiSalesDrafts,
  useApproveDraft,
  useRejectDraft,
  useEditDraft,
} from "@/hooks/use-ai-sales";
import type { AiSalesDraft, DraftsFilters } from "@/hooks/use-ai-sales";

const STATUS_FILTERS = [
  { value: "all", label: "Все" },
  { value: "pending", label: "Ожидают" },
  { value: "approved", label: "Одобрены" },
  { value: "rejected", label: "Отклонены" },
  { value: "auto_sent", label: "Авто" },
] as const;

export function DraftList() {
  const [filters, setFilters] = useState<DraftsFilters>({ status: "pending", page: 1 });
  const [editingDraft, setEditingDraft] = useState<AiSalesDraft | null>(null);

  const { data, isLoading } = useAiSalesDrafts(filters);
  const approveMutation = useApproveDraft();
  const rejectMutation = useRejectDraft();
  const editMutation = useEditDraft();

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  const handleReject = (id: string) => {
    rejectMutation.mutate(id);
  };

  const handleEditSubmit = (draftId: string, editedText: string, correctionType: string) => {
    editMutation.mutate(
      { draftId, editedText, correctionType },
      { onSuccess: () => setEditingDraft(null) }
    );
  };

  return (
    <div>
      {/* Фильтры */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_FILTERS.map((sf) => (
          <button
            key={sf.value}
            onClick={() =>
              setFilters((f) => ({ ...f, status: sf.value as DraftsFilters["status"], page: 1 }))
            }
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              filters.status === sf.value
                ? "bg-accent-purple/30 text-accent-purple/80 border border-accent-purple/40"
                : "bg-white/[0.06] text-white/40 border border-glass-subtle"
            )}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Список */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-white/[0.04] border border-glass-subtle animate-pulse"
            />
          ))}
        </div>
      ) : !data?.drafts?.length ? (
        <Empty
          icon="✉️"
          title={
            filters.status === "pending" ? "Нет черновиков для одобрения" : "Черновики не найдены"
          }
          description={
            filters.status === "pending"
              ? "Новые черновики появятся здесь"
              : "Попробуйте изменить фильтр"
          }
        />
      ) : (
        <div className="space-y-3">
          {data.drafts.map((draft, i) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              index={i}
              onApprove={handleApprove}
              onReject={handleReject}
              onEdit={setEditingDraft}
            />
          ))}
        </div>
      )}

      {/* Пагинация */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1)
            .slice(0, 5)
            .map((page) => (
              <button
                key={page}
                onClick={() => setFilters((f) => ({ ...f, page }))}
                className={cn(
                  "w-8 h-8 rounded-full text-xs font-medium transition-colors",
                  page === filters.page
                    ? "bg-accent-purple/30 text-accent-purple/80"
                    : "bg-white/[0.06] text-white/40"
                )}
              >
                {page}
              </button>
            ))}
        </div>
      )}

      {/* Модалка редактирования */}
      <DraftReviewModal
        draft={editingDraft}
        onClose={() => setEditingDraft(null)}
        onSubmit={handleEditSubmit}
        isLoading={editMutation.isPending}
      />
    </div>
  );
}

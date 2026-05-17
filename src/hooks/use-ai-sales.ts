/**
 * Hooks для AI-продажника
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// =====================================================
// Типы ответов API
// =====================================================

export interface AiSalesDraft {
  id: string;
  buyerMessage: string;
  originalDraft: string;
  editedDraft: string | null;
  confidence: number | null;
  reasoning: string | null;
  status: "pending" | "approved" | "rejected" | "expired" | "auto_sent";
  generatedAt: string;
  reviewedAt: string | null;
  sentAt: string | null;
  tokensUsed: number | null;
  generationTimeMs: number | null;
  itemContext: Record<string, unknown> | null;
  avitoChatId: string;
  chat: {
    avito_chat_id: string;
    item_id: number | null;
  } | null;
}

export interface DraftsListResponse {
  drafts: AiSalesDraft[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AiSalesSettings {
  mode: "draft" | "auto_simple" | "auto_full";
  isEnabled: boolean;
  confidenceThreshold: number;
  workHoursStart: number;
  workHoursEnd: number;
  timezone: string;
  minResponseDelay: number;
  maxResponseDelay: number;
  maxDraftsPerDay: number;
  maxAutoSendsPerDay: number;
  notifyOnDraft: boolean;
  notifyOnLowConfidence: boolean;
  notifyDailySummary: boolean;
}

export interface DailyStatEntry {
  date: string;
  totalIncoming: number;
  totalDrafts: number;
  totalApproved: number;
  totalEdited: number;
  totalRejected: number;
  totalAutoSent: number;
  totalExpired: number;
  avgGenerationTimeMs: number | null;
  avgReviewTimeSec: number | null;
  avgResponseTimeSec: number | null;
  approvalRate: number | null;
  correctionRate: number | null;
  totalTokens: number;
  estimatedCostUsd: number | null;
}

export interface StatsResponse {
  daily: DailyStatEntry[];
  totals: {
    totalIncoming: number;
    totalDrafts: number;
    totalApproved: number;
    totalEdited: number;
    totalRejected: number;
    totalAutoSent: number;
    totalExpired: number;
    totalTokens: number;
    estimatedCostUsd: number;
    avgApprovalRate: number | null;
  };
  pendingCount: number;
}

// =====================================================
// Фильтры
// =====================================================

export interface DraftsFilters {
  page?: number;
  limit?: number;
  status?: "all" | "pending" | "approved" | "rejected" | "expired" | "auto_sent";
  chatId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// =====================================================
// Hooks
// =====================================================

/**
 * Список черновиков с фильтрами и пагинацией
 */
export function useAiSalesDrafts(filters: DraftsFilters = {}) {
  return useQuery<DraftsListResponse>({
    queryKey: ["owner", "ai-sales", "drafts", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set("page", String(filters.page));
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.chatId) params.set("chatId", filters.chatId);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const res = await fetch(`/api/owner/ai-sales/drafts?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка загрузки черновиков");
      }
      return res.json();
    },
    staleTime: 10_000, // 10 секунд — черновики обновляются часто
    refetchInterval: 15_000, // Polling каждые 15 секунд для pending
  });
}

/**
 * Одобрить черновик (отправить как есть)
 */
export function useApproveDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/owner/ai-sales/drafts/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка одобрения");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "ai-sales", "drafts"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "ai-sales", "stats"] });
    },
  });
}

/**
 * Отредактировать и отправить черновик
 */
export function useEditDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      draftId,
      editedText,
      correctionType,
    }: {
      draftId: string;
      editedText: string;
      correctionType?: string;
    }) => {
      const res = await fetch(`/api/owner/ai-sales/drafts/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", editedText, correctionType }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка редактирования");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "ai-sales", "drafts"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "ai-sales", "stats"] });
    },
  });
}

/**
 * Отклонить черновик
 */
export function useRejectDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/owner/ai-sales/drafts/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка отклонения");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "ai-sales", "drafts"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "ai-sales", "stats"] });
    },
  });
}

/**
 * Настройки AI-продажника
 */
export function useAiSalesSettings() {
  return useQuery<{ settings: AiSalesSettings }>({
    queryKey: ["owner", "ai-sales", "settings"],
    queryFn: async () => {
      const res = await fetch("/api/owner/ai-sales/settings");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка загрузки настроек");
      }
      return res.json();
    },
    staleTime: 60_000,
  });
}

/**
 * Обновить настройки
 */
export function useUpdateAiSalesSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<AiSalesSettings>) => {
      const res = await fetch("/api/owner/ai-sales/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка сохранения");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "ai-sales", "settings"] });
    },
  });
}

/**
 * Статистика AI-продажника
 */
export function useAiSalesStats(days: number = 7) {
  return useQuery<StatsResponse>({
    queryKey: ["owner", "ai-sales", "stats", days],
    queryFn: async () => {
      const res = await fetch(`/api/owner/ai-sales/stats?days=${days}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка загрузки статистики");
      }
      return res.json();
    },
    staleTime: 60_000,
  });
}

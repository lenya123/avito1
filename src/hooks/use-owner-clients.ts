import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ClientListItem {
  id: string;
  tgUserId: number;
  telegramUsername: string | null;
  name: string | null;
  phone: string | null;
  vibeEnabled: boolean;
  vibeLimit: number;
  isFrozen: boolean;
  frozenAt: string | null;
  isBlocked: boolean;
  blockedReason: string | null;
  notes: string | null;
  createdAt: string;
  debt: number;
  stats: {
    orders: number;
    revenue: number;
  };
}

export interface ClientsListResponse {
  customers: ClientListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    vibeEnabled: number;
    frozen: number;
    blocked: number;
  };
}

export interface ClientsFilters {
  page?: number;
  limit?: number;
  search?: string;
  vibe?: "all" | "enabled" | "disabled";
  frozen?: "all" | "yes" | "no";
  blocked?: "all" | "yes" | "no";
  sort?: "created_at" | "orders" | "revenue" | "debt";
  order?: "asc" | "desc";
}

async function fetchClients(filters: ClientsFilters): Promise<ClientsListResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", filters.page.toString());
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.search) params.set("search", filters.search);
  if (filters.vibe && filters.vibe !== "all") params.set("vibe", filters.vibe);
  if (filters.frozen && filters.frozen !== "all") params.set("frozen", filters.frozen);
  if (filters.blocked && filters.blocked !== "all") params.set("blocked", filters.blocked);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);

  const response = await fetch(`/api/owner/customers?${params.toString()}`);
  if (!response.ok) throw new Error("Ошибка загрузки клиентов");
  return response.json();
}

export function useOwnerClients(filters: ClientsFilters = {}) {
  return useQuery({
    queryKey: ["owner", "clients", filters],
    queryFn: () => fetchClients(filters),
    staleTime: 30_000,
  });
}

// ===== Детали клиента =====

export interface ClientDetailCustomer {
  id: string;
  tgUserId: number;
  telegramUsername: string | null;
  name: string | null;
  phone: string | null;
  vibeEnabled: boolean;
  vibeCreditLimitOverride: number | null;
  effectiveLimit: number;
  isFrozen: boolean;
  frozenAt: string | null;
  frozenReason: string | null;
  requiredPaymentAmount: number | null;
  isBlocked: boolean;
  blockedReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  debt: number;
  customerBalance: number;
}

export interface BalanceHistoryEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
  orderId: string | null;
  orderNumber: number | null;
  withdrawalRequestId: string | null;
  actorUserId: string | null;
  actorName: string | null;
}

export interface PendingVibePayment {
  id: string;
  amount: number;
  receivedAt: string;
  recognizedText: string | null;
  receiptFileUrl: string | null;
  paymentMethodId: string | null;
}

export interface ClientDetailStats {
  total: number;
  completed: number;
  cancelled: number;
  returns: number;
  invested: number;
  revenue: number;
  profit: number;
  roi: number;
  avgCheck: number;
}

export interface ClientDetailOrder {
  id: string;
  orderNumber: number;
  status: string;
  clientPrice: number;
  isPaid: boolean;
  createdAt: string;
  sendBy: string;
  productName: string | null;
  productPhoto: string | null;
}

export interface DebtRecipient {
  recipientType: "owner" | "partner";
  partnerId: string | null;
  partnerName: string | null;
  debt: number;
}

export interface ClientDetails {
  customer: ClientDetailCustomer;
  stats: ClientDetailStats;
  recentOrders: ClientDetailOrder[];
  pendingVibePayments: PendingVibePayment[];
  balanceHistory: BalanceHistoryEntry[];
  debtByRecipient: DebtRecipient[];
}

export function useOwnerClient(id: string) {
  return useQuery({
    queryKey: ["owner", "client", id],
    queryFn: async () => {
      const res = await fetch(`/api/owner/customers/${id}`);
      if (!res.ok) throw new Error("Ошибка загрузки клиента");
      return res.json() as Promise<ClientDetails>;
    },
    enabled: !!id,
  });
}

// ===== Мутации =====

export interface ClientPatch {
  name?: string | null;
  phone?: string | null;
  vibeEnabled?: boolean;
  vibeCreditLimitOverride?: number | null;
  isBlocked?: boolean;
  blockedReason?: string | null;
  notes?: string | null;
}

export function useClientAction(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ClientPatch) => {
      const res = await fetch(`/api/owner/customers/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Ошибка обновления");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "clients"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "client", clientId] });
    },
  });
}

// Ручная корректировка баланса (➕ Пополнить / ➖ Списать).
export function useAdjustClientBalance(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { delta: number; note: string }) => {
      const res = await fetch(`/api/owner/customers/${clientId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Ошибка операции");
      }
      return res.json() as Promise<{ balanceAfter: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["owner", "clients"] });
    },
  });
}

// Confirm/reject pending vibe-payment (на /owner/vibe-payments/[id]/*).
export function useVibePaymentAction(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { paymentId: string; action: "confirm" | "reject" }) => {
      const res = await fetch(`/api/owner/vibe-payments/${payload.paymentId}/${payload.action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Ошибка операции");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "client", clientId] });
    },
  });
}

// Полная история движений баланса (для модалки).
export interface BalanceHistoryPage {
  items: BalanceHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
}

export function useFullBalanceHistory(clientId: string, limit = 50, offset = 0, enabled = false) {
  return useQuery({
    queryKey: ["owner", "client", clientId, "balance-history", limit, offset],
    queryFn: async () => {
      const res = await fetch(
        `/api/owner/customers/${clientId}/balance-history?limit=${limit}&offset=${offset}`
      );
      if (!res.ok) throw new Error("Ошибка загрузки истории");
      return res.json() as Promise<BalanceHistoryPage>;
    },
    enabled: !!clientId && enabled,
  });
}

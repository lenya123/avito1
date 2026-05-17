import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ClientListItem {
  id: string;
  telegramId: number;
  telegramUsername: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  level: number | null;
  deposit: number | null;
  referralDeposit: number | null;
  depositLimit: number | null;
  isVibePlus: boolean | null;
  vibePlusGrantedAt: string | null;
  isBlocked: boolean | null;
  blockedReason: string | null;
  subscriptionTier: string | null;
  subscriptionEnd: string | null;
  totalCompletedOrders: number | null;
  createdAt: string | null;
  stats: {
    orders: number;
    revenue: number;
    completed: number;
    returns: number;
  };
}

export interface ClientsListResponse {
  clients: ClientListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    active: number;
    premium: number;
    vibePlus: number;
  };
}

export interface ClientsFilters {
  page?: number;
  limit?: number;
  search?: string;
  tier?: "all" | "none" | "basic" | "premium" | "top_floor_boss";
  level?: number;
  status?: "all" | "active" | "blocked" | "vibe_plus";
  sort?: "created_at" | "orders" | "revenue" | "deposit";
  order?: "asc" | "desc";
}

async function fetchClients(filters: ClientsFilters): Promise<ClientsListResponse> {
  const params = new URLSearchParams();

  if (filters.page) params.set("page", filters.page.toString());
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.search) params.set("search", filters.search);
  if (filters.tier) params.set("tier", filters.tier);
  if (filters.level !== undefined) params.set("level", filters.level.toString());
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);

  const response = await fetch(`/api/owner/clients?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки клиентов");
  }
  return response.json();
}

export function useOwnerClients(filters: ClientsFilters = {}) {
  return useQuery({
    queryKey: ["owner", "clients", filters],
    queryFn: () => fetchClients(filters),
    staleTime: 30000,
  });
}

// Детали клиента
export interface ClientDetails {
  client: {
    id: string;
    telegramId: number;
    telegramUsername: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    level: number | null;
    discountPercent: number | null;
    deposit: number | null;
    referralDeposit: number | null;
    depositLimit: number | null;
    isVibePlus: boolean | null;
    vibePlusGrantedAt: string | null;
    vibePlusGrantedBy: { telegram_username: string | null; name: string | null } | null;
    isBlocked: boolean | null;
    blockedReason: string | null;
    subscriptionTier: string | null;
    subscriptionStart: string | null;
    subscriptionEnd: string | null;
    totalCompletedOrders: number | null;
    firstOrderDiscountUsed: boolean | null;
    referralCode: string | null;
    referredBy: string | null;
    referralsCount: number;
    createdAt: string | null;
    updatedAt: string | null;
  };
  stats: {
    total: number;
    completed: number;
    cancelled: number;
    returns: number;
    revenue: number;
    avgCheck: number;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    price: number;
    createdAt: string;
    productName: string;
    productPhoto: string | null;
  }>;
}

async function fetchClient(id: string): Promise<ClientDetails> {
  const response = await fetch(`/api/owner/clients/${id}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки клиента");
  }
  return response.json();
}

export function useOwnerClient(id: string) {
  return useQuery({
    queryKey: ["owner", "client", id],
    queryFn: () => fetchClient(id),
    enabled: !!id,
  });
}

// Мутации
interface ClientAction {
  clientId: string;
  action: "toggle_vibe_plus" | "block" | "unblock" | "update_deposit_limit";
  reason?: string;
  depositLimit?: number;
}

async function updateClient({ clientId, action, reason, depositLimit }: ClientAction) {
  const response = await fetch(`/api/owner/clients/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason, depositLimit }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Ошибка обновления");
  }

  return response.json();
}

export function useClientAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateClient,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["owner", "clients"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "client", variables.clientId] });
    },
  });
}

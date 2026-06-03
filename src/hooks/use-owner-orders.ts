import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { StatsGranularity } from "@/types/stats";

export interface OrderListItem {
  id: string;
  orderNumber: number;
  status: string;
  clientPrice: number;
  purchasePrice: number;
  /** Прибыль по канону §9.4 (считается на сервере единым хелпером). */
  profit: number;
  salePrice: number | null;
  size: string;
  deliveryService: string | null;
  sendBy: string | null;
  trackingNumber: string | null;
  pickupPointId: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    username: string | null;
    name: string | null;
  } | null;
  product: {
    id: string;
    name: string;
    photo: string | null;
  } | null;
}

export interface OrdersListResponse {
  orders: OrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    totalOrders: number;
    totalRevenue: number;
    totalProfit: number;
  };
}

export interface OrdersFilters {
  page?: number;
  limit?: number;
  search?: string;
  // Канон §4.2 + §15 (Авито) + virtual-фильтры (all/active/returns).
  status?:
    | "all"
    | "active"
    | "returns"
    | "paid"
    | "collecting"
    | "sent"
    | "return"
    | "return_done"
    | "problem"
    | "cancelled"
    | "trash"
    | "awaiting_size"
    | "delivered"
    | "return_in_transit";
  clientId?: string;
  productId?: string;
  sellerId?: string;
  deliveryService?: "all" | "avito" | "yandex" | "cdek" | "pochta" | "5post";
  /** Оплата: all (все) | paid (оплачены) | debt (+ВАЙБ в долг). */
  payment?: "all" | "paid" | "debt";
  /** Источник: all | owner (свой склад) | partner (партнёрские). */
  source?: "all" | "owner" | "partner" | "drop" | "avito";
  dateFrom?: string;
  dateTo?: string;
  sort?: "created_at" | "order_number" | "client_price" | "deadline";
  order?: "asc" | "desc";
}

async function fetchOrders(filters: OrdersFilters): Promise<OrdersListResponse> {
  const params = new URLSearchParams();

  if (filters.page) params.set("page", filters.page.toString());
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.clientId) params.set("clientId", filters.clientId);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.sellerId) params.set("sellerId", filters.sellerId);
  if (filters.deliveryService) params.set("deliveryService", filters.deliveryService);
  if (filters.payment) params.set("payment", filters.payment);
  if (filters.source) params.set("source", filters.source);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);

  const response = await fetch(`/api/owner/orders?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки заказов");
  }
  return response.json();
}

export function useOwnerOrders(filters: OrdersFilters = {}) {
  return useQuery({
    queryKey: ["owner", "orders", filters],
    queryFn: () => fetchOrders(filters),
    staleTime: 30000,
  });
}

// Массовые действия над заказами
interface BatchOrderAction {
  orderIds: string[];
  action: "cancel" | "change_status";
  status?: string;
}

async function batchOrderAction({ orderIds, action, status }: BatchOrderAction) {
  const response = await fetch("/api/owner/orders/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderIds, action, status }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Ошибка выполнения действия");
  }

  return response.json();
}

export function useBatchOrderAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: batchOrderAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "orders"] });
    },
  });
}

// Детали заказа
export interface OrderDetail {
  order: {
    id: string;
    orderNumber: number;
    status: string;
    source: string | null;
    clientPrice: number;
    purchasePrice: number;
    salePrice: number | null;
    clientProfit: number | null;
    appliedBalance: number;
    balanceRefund: { amount: number; reason: string; date: string } | null;
    size: string | null;
    deliveryService: string;
    dispatchCity: string | null;
    sendBy: string;
    trackingNumber: string | null;
    returnTrackingNumber: string | null;
    pickupPointId: string | null;
    avitoOrderId: string | null;
    isPaid: boolean;
    paidAt: string | null;
    paymentMethod: string | null;
    confirmedBy: string | null;
    visionOperationId: string | null;
    visionAmount: number | null;
    visionRecipientCardLast4: string | null;
    visionRecipientPhone: string | null;
    visionRecipientIpName: string | null;
    clientComment: string | null;
    systemComment: string | null;
    problemType: string | null;
    cancelReason: string | null;
    faultParty: string | null;
    faultReason: string | null;
    shippedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    returnCode: string | null;
    expectedReturnDate: string | null;
    returnCompletedAt: string | null;
    // §15 — Авито таймлайн (NULL для дроп-заказов).
    deliveredAt: string | null;
    returnInitiatedAt: string | null;
    returnArrivedAt: string | null;
    trashDeadline: string | null;
    barcodeImageUrl: string | null;
    returnBarcodeImageUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  product: {
    id: string;
    name: string;
    photo: string | null;
    dropPrice: number;
    purchasePrice: number;
  } | null;
  client: {
    id: string;
    telegramId: number;
    telegramUsername: string | null;
    name: string | null;
    phone: string | null;
    isVibePlus: boolean;
  } | null;
  shipper: {
    id: string;
    name: string;
    telegramUsername: string | null;
  } | null;
  partner: {
    id: string;
    name: string;
    tgUsername: string | null;
    isLinked: boolean;
    commissionSnapshot: number | null;
    requisitesText: string | null;
    paymentReceivedAt: string | null;
    commissionPaidAt: string | null;
  } | null;
  availableShippers: Array<{ id: string; name: string }>;
  history: Array<{
    id: string;
    action: string;
    details: unknown;
    createdAt: string;
  }>;
}

async function fetchOrder(id: string): Promise<OrderDetail> {
  const response = await fetch(`/api/owner/orders/${id}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки заказа");
  }
  return response.json();
}

export function useOwnerOrder(id: string) {
  return useQuery({
    queryKey: ["owner", "order", id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
  });
}

// Обновление заказа
interface UpdateOrderInput {
  orderId: string;
  action: "change_status" | "assign_shipper" | "update_tracking" | "update_comment";
  status?: string;
  shipperId?: string;
  trackingNumber?: string;
  returnTrackingNumber?: string;
  systemComment?: string;
  cancelReason?: string;
}

async function updateOrder({ orderId, ...data }: UpdateOrderInput) {
  const response = await fetch(`/api/owner/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка обновления заказа");
  }

  return response.json();
}

export function useUpdateOwnerOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateOrder,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["owner", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "order", variables.orderId] });
    },
  });
}

// === Owner Stats ===

export type OwnerStatsParams = {
  dateFrom?: string;
  dateTo?: string;
  granularity?: StatsGranularity;
};

export type OwnerStatsResponse = {
  summary: {
    totalOrders: number;
    completedOrders: number;
    totalInvested: number;
    totalRevenue: number;
    totalProfit: number;
    roi: number;
    inProgress: {
      count: number;
      amount: number;
    };
  };
  chartData: Array<{
    date: string;
    label: string;
    orders: number;
    revenue: number;
    profit: number;
    invested: number;
  }>;
  granularity: StatsGranularity;
  dateFrom: string;
  dateTo: string;
};

async function fetchOwnerStats(params: OwnerStatsParams): Promise<OwnerStatsResponse> {
  const searchParams = new URLSearchParams();
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  if (params.granularity) searchParams.set("granularity", params.granularity);

  const response = await fetch(`/api/owner/stats?${searchParams}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки статистики");
  }
  return response.json();
}

export function useOwnerStats(params: OwnerStatsParams = {}) {
  return useQuery({
    queryKey: ["owner", "stats", params],
    queryFn: () => fetchOwnerStats(params),
    staleTime: 60 * 1000,
  });
}

// Экспорт статусов
export const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "awaiting_size", label: "Ждут размера" },
  { value: "sent", label: "Завершённые" },
  { value: "problem", label: "Проблемные" },
  { value: "returns", label: "Возвраты" },
] as const;

// Фильтр по оплате: paid = is_paid=true, debt = +ВАЙБ в долг (is_paid=false).
export const PAYMENT_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "paid", label: "Оплачены" },
  { value: "debt", label: "В долг" },
] as const;

// Фильтр по источнику: партнёрские vs свои (по polю orders.partner_id)
// + Дроп/Авито по orders.source (§15).
export const SOURCE_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "owner", label: "Свои" },
  { value: "partner", label: "Партнёрские" },
  { value: "drop", label: "Дроп" },
  { value: "avito", label: "Авито" },
] as const;

// Re-export from canonical source
export { ORDER_STATUS_LABELS, DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";

// Owner-specific Tailwind color classes — канон §4.2 + legacy aliases для
// исторических заказов в БД (badge мог рендериться по старому статусу).
export const ORDER_STATUS_COLORS: Record<string, string> = {
  paid: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  collecting: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  sent: "bg-green-500/10 text-green-400 border-green-500/20",
  return: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  return_done: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  problem: "bg-red-500/10 text-red-400 border-red-500/20",
  trash: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

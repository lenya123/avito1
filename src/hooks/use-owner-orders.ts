import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface OrderListItem {
  id: string;
  orderNumber: number;
  status: string;
  clientPrice: number;
  purchasePrice: number;
  salePrice: number | null;
  size: string;
  deliveryService: string | null;
  deliveryDeadline: string | null;
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
  status?:
    | "all"
    | "active"
    | "completed"
    | "problem"
    | "returns"
    | "awaiting_shipment"
    | "collecting"
    | "in_transit"
    | "return_in_transit"
    | "return_arrived"
    | "return_completed"
    | "cancelled"
    | "trash"
    | "disposed";
  clientId?: string;
  productId?: string;
  deliveryService?: "all" | "avito" | "yandex" | "cdek" | "pochta" | "5post";
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
  if (filters.deliveryService) params.set("deliveryService", filters.deliveryService);
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
    size: string | null;
    deliveryService: string;
    deliveryDeadline: string;
    trackingNumber: string | null;
    returnTrackingNumber: string | null;
    pickupPointId: string | null;
    avitoOrderId: string | null;
    isPaid: boolean;
    paidAt: string | null;
    paymentMethod: string | null;
    clientComment: string | null;
    systemComment: string | null;
    cancelReason: string | null;
    shippedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    returnCode: string | null;
    expectedReturnDate: string | null;
    returnCompletedAt: string | null;
    trashDeadline: string | null;
    barcodeImageUrl: string | null;
    returnBarcodeImageUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  product: {
    id: string;
    name: string;
    brand: string | null;
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
    level: number | null;
    isVibePlus: boolean;
  } | null;
  shipper: {
    id: string;
    name: string;
    telegramUsername: string | null;
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

// Экспорт статусов
export const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "completed", label: "Завершённые" },
  { value: "problem", label: "Проблемные" },
  { value: "returns", label: "Возвраты" },
] as const;

// Re-export from canonical source
export { ORDER_STATUS_LABELS, DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";

// Owner-specific Tailwind color classes (different from client's color key format)
export const ORDER_STATUS_COLORS: Record<string, string> = {
  awaiting_shipment: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  collecting: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  in_transit: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  return_in_transit: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  return_arrived: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  return_completed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  problem: "bg-red-500/10 text-red-400 border-red-500/20",
  trash: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  disposed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

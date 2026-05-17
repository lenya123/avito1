"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import type { OrderStatus, DeliveryService } from "@/types/database";

// Re-export types for convenience
export type { OrderStatus, DeliveryService };

// Types
export type OrdersFilter = {
  status?: OrderStatus;
  dateFrom?: string;
  dateTo?: string;
};

export type CreateOrderInput = {
  productId: string;
  productSizeId?: string;
  size?: string;
  deliveryService: DeliveryService;
  trackingNumber: string;
  deliveryDeadline: string;
  barcodeImageUrl?: string;
  salePrice?: number;
  comment?: string;
  reservationId?: string;
  idempotencyKey?: string;
};

export type UpdateOrderInput = {
  productSizeId?: string;
  size?: string;
  barcodeImageUrl?: string;
  trackingNumber?: string;
  deliveryDeadline?: string;
  salePrice?: number;
  cancel?: boolean;
  cancelReason?: string;
  complete?: boolean;
  initiateReturn?: boolean;
  returnBarcodeImageUrl?: string;
  returnTrackingNumber?: string;
  expectedReturnDate?: string;
  returnCode?: string;
  returnDeadline?: string;
  restoreFromTrash?: boolean;
};

export type CreateReservationInput = {
  productSizeId?: string;
  productId?: string;
  sessionId?: string;
};

export type DeleteReservationInput = {
  reservationId: string;
};

// Fetch functions
async function fetchOrders(filters: OrdersFilter, page: number, limit: number) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (filters.status) params.append("status", filters.status);
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);

  const response = await fetch(`/api/orders?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки заказов");
  }

  return response.json();
}

async function fetchOrder(orderId: string) {
  const response = await fetch(`/api/orders/${orderId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки заказа");
  }

  return response.json();
}

async function createOrder(input: CreateOrderInput) {
  console.log("Creating order with input:", input);

  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("Order creation failed:", error);
    throw new Error(error.error || "Ошибка создания заказа");
  }

  return response.json();
}

async function updateOrder(orderId: string, input: UpdateOrderInput) {
  const response = await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка обновления заказа");
  }

  return response.json();
}

async function fetchReservations() {
  const response = await fetch("/api/reservations");

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки резервов");
  }

  return response.json();
}

async function createReservation(input: CreateReservationInput) {
  const response = await fetch("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    // Используем message для понятных пользователю сообщений, error для кодов
    throw new Error(error.message || error.error || "Ошибка резервирования");
  }

  return response.json();
}

async function deleteReservation(input: DeleteReservationInput) {
  const response = await fetch("/api/reservations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка удаления резерва");
  }

  return response.json();
}

// Hooks

/**
 * Хук для получения списка заказов
 */
export function useOrders(filters: OrdersFilter = {}, page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ["orders", filters, page, limit],
    queryFn: () => fetchOrders(filters, page, limit),
    staleTime: 30 * 1000, // 30 секунд
  });
}

/**
 * Хук для получения деталей заказа
 */
export function useOrder(orderId: string | null) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId!),
    enabled: !!orderId,
    staleTime: 30 * 1000,
  });
}

/**
 * Хук для создания заказа
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  const checkAuth = useAuthStore((state) => state.checkAuth);

  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      // Инвалидируем списки заказов и продуктов
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      // Обновляем данные пользователя в Zustand store (включая баланс)
      checkAuth();
    },
  });
}

/**
 * Хук для обновления заказа
 */
export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: UpdateOrderInput }) =>
      updateOrder(orderId, input),
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}

/**
 * Хук для отмены заказа
 */
export function useCancelOrder() {
  const updateOrder = useUpdateOrder();

  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      updateOrder.mutateAsync({
        orderId,
        input: { cancel: true, cancelReason: reason },
      }),
  });
}

/**
 * Хук для завершения заказа
 */
export function useCompleteOrder() {
  const updateOrder = useUpdateOrder();

  return useMutation({
    mutationFn: (orderId: string) =>
      updateOrder.mutateAsync({
        orderId,
        input: { complete: true },
      }),
  });
}

/**
 * Хук для получения резервов пользователя
 */
export function useReservations() {
  return useQuery({
    queryKey: ["reservations"],
    queryFn: fetchReservations,
    staleTime: 15 * 1000, // 15 секунд
    refetchInterval: 30 * 1000, // Обновляем каждые 30 секунд
  });
}

/**
 * Хук для создания резерва
 * Инвалидируем product чтобы другие вкладки видели актуальные данные о доступности
 */
export function useCreateReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/**
 * Хук для удаления резерва
 */
export function useDeleteReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// Utility hooks

// Re-export status labels/colors from canonical source
export {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  getOrderStatusLabel,
  getOrderStatusColor,
} from "@/lib/constants/order-status";

/**
 * Хук для проверки дневного лимита заказов
 * Возвращает информацию о лимите и оставшемся количестве заказов
 */
export function useDailyOrderLimit() {
  const { user } = useAuthStore();

  // Получаем количество заказов за сегодня
  const today = new Date().toISOString().split("T")[0];

  const { data, isLoading } = useQuery({
    queryKey: ["orders", "today-count", today],
    queryFn: async () => {
      const response = await fetch(`/api/orders?dateFrom=${today}&dateTo=${today}&limit=1`);
      if (!response.ok) throw new Error("Failed to fetch orders count");
      const result = await response.json();
      return result.pagination?.total ?? 0;
    },
    staleTime: 30 * 1000, // 30 секунд
    enabled: !!user,
  });

  const todayOrdersCount = data ?? 0;

  // Проверяем лимиты
  const isVibePlus = user?.isVibePlus ?? false;
  const subscriptionTier = user?.subscriptionTier ?? "none";
  const hasUnlimitedOrders =
    isVibePlus || subscriptionTier === "premium" || subscriptionTier === "top_floor_boss";

  const DAILY_LIMIT = 3;
  const remaining = hasUnlimitedOrders ? Infinity : Math.max(0, DAILY_LIMIT - todayOrdersCount);
  const canOrder = hasUnlimitedOrders || remaining > 0;

  return {
    isLoading,
    todayOrdersCount,
    limit: hasUnlimitedOrders ? Infinity : DAILY_LIMIT,
    remaining,
    canOrder,
    hasUnlimitedOrders,
    upgradeMessage: !canOrder ? "Перейдите на Premium для безлимитных заказов" : undefined,
  };
}

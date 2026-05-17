import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ShipperOrder {
  id: string;
  order_number: number;
  size: string;
  status: string;
  delivery_service: string;
  delivery_deadline: string;
  tracking_number: string | null;
  avito_order_id: string | null;
  avito_buyer_name: string | null;
  avito_delivery_address: string | null;
  barcode_printed: boolean;
  barcode_image_url: string | null;
  problem_type: "out_of_stock" | "bad_barcode" | null;
  linked_return_order_id: string | null;
  client_comment: string | null;
  system_comment: string | null;
  return_code: string | null;
  return_code_updated_at: string | null;
  shipped_at: string | null;
  updated_at: string | null;
  created_at: string;
  isUrgent: boolean;
  source?: string | null;
  product: {
    id: string;
    name: string;
    photo_urls: string[] | null;
  } | null;
  client: {
    id: string;
    telegram_username: string | null;
  };
  pickup_point: {
    id: string;
    address: string;
    delivery_service: string;
  } | null;
}

interface OrdersFilters {
  status?:
    | "awaiting_shipment"
    | "collecting"
    | "in_transit"
    | "delivered_to_point"
    | "completed"
    | "not_picked_up"
    | "return_arrived"
    | "return_completed"
    | "cancelled"
    | "disposed"
    | "trash";
  statuses?: string[];
  delivery_service?: string;
  pickup_point_id?: string;
  urgent?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

// Хук для получения заказов
export function useShipperOrders(filters: OrdersFilters = {}) {
  return useQuery({
    queryKey: ["shipper-orders", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.statuses && filters.statuses.length > 0) {
        params.set("statuses", filters.statuses.join(","));
      } else if (filters.status) {
        params.set("status", filters.status);
      }
      if (filters.delivery_service) params.set("delivery_service", filters.delivery_service);
      if (filters.pickup_point_id) params.set("pickup_point_id", filters.pickup_point_id);
      if (filters.urgent) params.set("urgent", "true");
      if (filters.search) params.set("search", filters.search);
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.offset) params.set("offset", String(filters.offset));

      const response = await fetch(`/api/shipper/orders?${params}`);
      if (!response.ok) {
        throw new Error("Ошибка загрузки заказов");
      }
      const data = await response.json();
      return data.orders as ShipperOrder[];
    },
    staleTime: 2 * 60 * 1000, // 2 мин — Realtime обновляет мгновенно
    refetchInterval: 5 * 60 * 1000, // 5 мин safety net (Realtime обновляет мгновенно)
  });
}

// Хук для исторических заказов (с пагинацией и поиском)
export function useShipperHistoryOrders(search: string, offset: number, limit = 50) {
  return useQuery({
    queryKey: ["shipper-orders-history", search, offset, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("statuses", "completed,return_completed,cancelled,disposed,trash");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (search) params.set("search", search);

      const response = await fetch(`/api/shipper/orders?${params}`);
      if (!response.ok) throw new Error("Ошибка загрузки истории");
      const data = await response.json();
      return { orders: data.orders as ShipperOrder[], total: (data.total ?? 0) as number };
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

// Хук для действий над одним заказом
export function useOrderAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      action,
      pickup_point_id,
      problem_type,
      dispute_photos,
      dispute_reason,
    }: {
      orderId: string;
      action:
        | "print_barcode"
        | "mark_problem"
        | "ship"
        | "complete_return"
        | "dispute_return"
        | "start_return"
        | "cancel_order"
        | "undo_print"
        | "undo_ship"
        | "undo_problem";
      pickup_point_id?: string;
      problem_type?: "out_of_stock" | "bad_barcode";
      dispute_photos?: string[];
      dispute_reason?: string;
    }) => {
      const response = await fetch(`/api/shipper/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          pickup_point_id,
          problem_type,
          dispute_photos,
          dispute_reason,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка выполнения");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-orders"] });
      queryClient.invalidateQueries({ queryKey: ["shipper-stats"] });
    },
  });
}

// Хук для пакетных действий
export function useBatchOrderAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      action,
      order_ids,
      pickup_point_id,
      problem_type,
      size,
      product_size_id,
    }: {
      action:
        | "print_barcode"
        | "mark_problem"
        | "ship"
        | "complete_return"
        | "start_return"
        | "mark_return_arrived"
        | "cancel_order"
        | "undo_print"
        | "undo_ship"
        | "undo_problem"
        | "set_size";
      order_ids: string[];
      pickup_point_id?: string;
      problem_type?: "out_of_stock" | "bad_barcode";
      size?: string;
      product_size_id?: string;
    }) => {
      const response = await fetch("/api/shipper/orders/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          order_ids,
          pickup_point_id,
          problem_type,
          size,
          product_size_id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка выполнения");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-orders"] });
      queryClient.invalidateQueries({ queryKey: ["shipper-stats"] });
    },
  });
}

// Хук для установки размера заказа
export function useSetOrderSize() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      size,
      product_size_id,
    }: {
      orderId: string;
      size: string;
      product_size_id: string;
    }) => {
      const response = await fetch(`/api/shipper/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_size", size, product_size_id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка установки размера");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-orders"] });
      queryClient.invalidateQueries({ queryKey: ["shipper-stock"] });
    },
  });
}

// Re-export from canonical source
export { ORDER_STATUS_LABELS, DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";

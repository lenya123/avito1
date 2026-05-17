import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface StockProductSize {
  id: string;
  size: string;
  currentQuantity: number;
  reservedQuantity: number;
  actualQuantity: number | null;
}

export interface StockProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  photoUrl: string | null;
  currentQuantity: number;
  reservedQuantity: number;
  isInStock: boolean;
  expectedArrivalDate: string | null;
  sizes: StockProductSize[];
  totalAvailable: number;
  totalCurrent: number;
  totalReserved: number;
  totalActual: number | null;
}

interface StockFilters {
  search?: string;
  filter?: "all" | "in_stock" | "out_of_stock";
}

export function useShipperStock(filters: StockFilters = {}) {
  return useQuery({
    queryKey: ["shipper-stock", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.filter && filters.filter !== "all") params.set("filter", filters.filter);

      const response = await fetch(`/api/shipper/stock?${params}`);
      if (!response.ok) {
        throw new Error("Ошибка загрузки товаров");
      }
      const data = await response.json();
      return data.products as StockProduct[];
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // 5 мин safety net (Realtime обновляет мгновенно)
  });
}

interface AdjustStockParams {
  productId: string;
  sizes?: Array<{ size_id: string; new_quantity: number }>;
  new_sizes?: Array<{ size: string; quantity: number }>;
  new_quantity?: number;
  actual_sizes?: Array<{ size_id: string; actual_quantity: number }>;
  actual_quantity?: number;
}

export function useAdjustStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      sizes,
      new_sizes,
      new_quantity,
      actual_sizes,
      actual_quantity,
    }: AdjustStockParams) => {
      const response = await fetch(`/api/shipper/stock/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes, new_sizes, new_quantity, actual_sizes, actual_quantity }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка сохранения");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-stock"] });
    },
  });
}

interface CreateProductParams {
  name: string;
  brand?: string;
  sizes?: Array<{ size: string; quantity: number }>;
  quantity?: number;
}

interface CreateManualOrderParams {
  product_id: string;
  product_size_id?: string;
  size?: string;
  delivery_service: string;
}

export function useCreateManualOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateManualOrderParams) => {
      const response = await fetch("/api/shipper/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка создания заказа");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-stock"] });
      queryClient.invalidateQueries({ queryKey: ["shipper-orders"] });
    },
  });
}

export function useUploadProductPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, file }: { productId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productId", productId);

      const response = await fetch("/api/shipper/stock/upload-photo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка загрузки");
      }

      return response.json() as Promise<{ success: boolean; photoUrl: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-stock"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      const response = await fetch(`/api/shipper/stock/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка удаления");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-stock"] });
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateProductParams) => {
      const response = await fetch("/api/shipper/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка создания");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-stock"] });
    },
  });
}

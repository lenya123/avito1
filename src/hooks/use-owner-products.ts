import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ProductListItem {
  id: string;
  name: string;
  category: string | null;
  purchasePrice: number;
  dropPrice: number;
  recommendedPrice: number | null;
  photoUrl: string | null;
  isActive: boolean;
  isPremium: boolean;
  isInStock: boolean;
  expectedArrivalDate: string | null;
  createdAt: string;
  sizes: Array<{
    size: string;
    current: number;
    initial: number;
  }>;
  totalStock: number;
  totalInitial: number;
  sales: {
    sold: number;
    revenue: number;
  };
  loss: {
    units: number;
    rub: number;
    surplus: number;
  };
}

export interface ProductsListResponse {
  products: ProductListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    active: number;
    inStock: number;
    inTransit: number;
  };
  categories: string[];
  sizes: string[];
}

export interface ProductsFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: "all" | "active" | "inactive";
  stock?: "all" | "in_stock" | "in_transit" | "out_of_stock" | "low_stock";
  loss?: "all" | "with_loss";
  premium?: "all" | "yes" | "no";
  category?: string;
  size?: string;
  sort?: "created_at" | "name" | "price" | "stock";
  order?: "asc" | "desc";
  /** "self" (default) — только мои товары; "all" — все товары платформы (admin view) */
  scope?: "self" | "all";
  /** Новая конвенция: "me" → main-seller, "all" → все, <uuid> → конкретный селлер. */
  sellerId?: string;
}

async function fetchProducts(filters: ProductsFilters): Promise<ProductsListResponse> {
  const params = new URLSearchParams();

  if (filters.page) params.set("page", filters.page.toString());
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.stock) params.set("stock", filters.stock);
  if (filters.loss) params.set("loss", filters.loss);
  if (filters.premium) params.set("premium", filters.premium);
  if (filters.category) params.set("category", filters.category);
  if (filters.size) params.set("size", filters.size);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.sellerId) params.set("sellerId", filters.sellerId);

  const response = await fetch(`/api/owner/products?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки товаров");
  }
  return response.json();
}

export function useOwnerProducts(filters: ProductsFilters = {}) {
  return useQuery({
    queryKey: ["owner", "products", filters],
    queryFn: () => fetchProducts(filters),
    staleTime: 30000,
  });
}

// Создание товара
export interface ProductBindingInput {
  /** id привязки если она уже существует (для PATCH); опционально для POST. */
  id?: string | null;
  partnerId: string;
  warehouseKind: "owner" | "partner";
  commission: number;
  sizes: Array<{
    size: string;
    currentQuantity: number;
  }>;
}

export interface CreateProductInput {
  name: string;
  category?: string;
  description?: string;
  purchasePrice: number;
  dropPrice: number;
  recommendedPrice?: number;
  photoUrls?: string[];
  isPremium?: boolean;
  isInStock?: boolean;
  expectedArrivalDate?: string;
  supplierId?: string;
  locationCity?: string | null;
  sizes: Array<{
    size: string;
    quantity: number;
    /** Замеры пер-размер (см), поля зависят от категории (§11.6). */
    measurements?: Record<string, number>;
  }>;
  /** Лестница привязок партнёров. Порядок в массиве = priority. */
  bindings?: ProductBindingInput[];
}

async function createProduct(input: CreateProductInput) {
  const response = await fetch("/api/owner/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Ошибка создания товара");
  }

  return response.json();
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "products"] });
    },
  });
}

// Детали товара
export interface ProductDetail {
  product: {
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    purchasePrice: number;
    dropPrice: number;
    recommendedPrice: number | null;
    photoUrls: string[];
    coverUrl: string | null;
    isPremium: boolean;
    isActive: boolean;
    isInStock: boolean;
    expectedArrivalDate: string | null;
    measurements: Record<string, string> | null;
    locationCity: string | null;
    createdAt: string;
    updatedAt: string;
    sizes: Array<{
      id: string;
      size: string;
      currentQuantity: number;
      initialQuantity: number;
      sold: number;
      measurements: Record<string, number>;
    }>;
    totalStock: number;
    totalInitial: number;
    bindings: Array<{
      id: string;
      priority: number;
      warehouseKind: "owner" | "partner";
      commission: number;
      partnerId: string;
      partnerName: string;
      partnerUsername: string | null;
      partnerIsActive: boolean;
      partnerHasRequisites: boolean;
      partnerWarehouseCity: string | null;
      partnerAcceptsVibeDebt: boolean;
      sizes: Array<{ size: string; currentQuantity: number; reservedQuantity: number }>;
    }>;
  };
  sales: {
    total: number;
    completed: number;
    sold: number;
    soldLast30: number;
    cancelled: number;
    returns: number;
    revenue: number;
    cost: number;
    profit: number;
    revenueCount: number;
    avgPrice: number;
    firstOrderAt: string | null;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    price: number;
    size: string;
    createdAt: string;
    clientUsername: string | null;
  }>;
  salesChart: Array<{ date: string; count: number }>;
  salesGranularity: "day" | "week" | "month";
  reconciliation: {
    lossUnits: number;
    lossRub: number;
    surplusUnits: number;
    events: Array<{
      size: string | null;
      systemBefore: number;
      counted: number;
      delta: number;
      rub: number;
      createdAt: string;
      by: string | null;
    }>;
  };
  batches: ProductBatch[];
}

// Партия закупки (журнал, §11.5).
export interface ProductBatch {
  id: string;
  batchNumber: number;
  purchasePrice: number;
  createdAt: string;
  sizes: Array<{ size_id: string; size: string; quantity: number }>;
}

async function fetchProduct(id: string): Promise<ProductDetail> {
  const response = await fetch(`/api/owner/products/${id}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки товара");
  }
  return response.json();
}

export function useOwnerProduct(id: string) {
  return useQuery({
    queryKey: ["owner", "product", id],
    queryFn: () => fetchProduct(id),
    enabled: !!id,
  });
}

// Обновление товара
interface UpdateProductInput {
  productId: string;
  name?: string;
  category?: string | null;
  description?: string | null;
  purchasePrice?: number;
  dropPrice?: number;
  recommendedPrice?: number | null;
  photoUrls?: string[];
  isPremium?: boolean;
  isActive?: boolean;
  isInStock?: boolean;
  expectedArrivalDate?: string | null;
  measurements?: Record<string, string> | null;
  locationCity?: string | null;
  sizes?: Array<{ size: string; quantity: number }>;
  oneSizeQuantity?: number;
  /** Замеры пер-размер (§11.6): [{ size, measurements }]. */
  sizeMeasurements?: Array<{ size: string; measurements: Record<string, number> }>;
  /** Лестница привязок партнёров — полное состояние (порядок = priority). */
  bindings?: ProductBindingInput[];
}

async function updateProduct({ productId, ...data }: UpdateProductInput) {
  const response = await fetch(`/api/owner/products/${productId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка обновления товара");
  }

  return response.json();
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProduct,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["owner", "products"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "product", variables.productId] });
    },
  });
}

// Удаление товара
async function deleteProduct(productId: string) {
  const response = await fetch(`/api/owner/products/${productId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка удаления товара");
  }

  return response.json();
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "products"] });
    },
  });
}

// Явные действия владельца над остатком размера (канон §11.4):
//   restock   — «Пришла партия» (+qty): остаток и «закуплено» растут.
//   reconcile — «Поправить остаток» с признанием потери/излишка: qty =
//               физфакт, пишется недостача/излишек, остаток := факт.
//   correct   — тихая поправка опечатки: qty = новое значение, «закуплено»
//               не трогается, событие недостачи не пишется.
export type StockAction = "restock" | "reconcile" | "correct";

interface StockActionInput {
  productId: string;
  sizeId: string;
  action: StockAction;
  qty: number;
}

async function productStockAction({ productId, sizeId, action, qty }: StockActionInput) {
  const response = await fetch(`/api/owner/products/${productId}/stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, sizeId, qty }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка изменения остатка");
  }

  return response.json();
}

export function useProductStockAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: productStockAction,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["owner", "products"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "product", variables.productId] });
    },
  });
}

// Партии закупок (журнал, §11.5): добавить / править / удалить.
type BatchSizeInput = { size_id: string; size: string; quantity: number };
type BatchActionInput =
  | { productId: string; action: "add"; price: number; sizes: BatchSizeInput[] }
  | {
      productId: string;
      action: "edit";
      batchId: string;
      price: number;
      sizes: BatchSizeInput[];
    }
  | { productId: string; action: "delete"; batchId: string };

async function productBatchAction(input: BatchActionInput) {
  const { productId, ...body } = input;
  const response = await fetch(`/api/owner/products/${productId}/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка изменения партии");
  }

  return response.json();
}

export function useProductBatchAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: productBatchAction,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["owner", "products"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "product", variables.productId] });
    },
  });
}

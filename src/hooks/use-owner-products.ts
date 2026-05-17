import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ProductListItem {
  id: string;
  name: string;
  brand: string | null;
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
  };
  categories: string[];
}

export interface ProductsFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: "all" | "active" | "inactive";
  stock?: "all" | "in_stock" | "in_transit" | "out_of_stock";
  premium?: "all" | "yes" | "no";
  category?: string;
  sort?: "created_at" | "name" | "price" | "stock";
  order?: "asc" | "desc";
}

async function fetchProducts(filters: ProductsFilters): Promise<ProductsListResponse> {
  const params = new URLSearchParams();

  if (filters.page) params.set("page", filters.page.toString());
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.stock) params.set("stock", filters.stock);
  if (filters.premium) params.set("premium", filters.premium);
  if (filters.category) params.set("category", filters.category);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);

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
export interface CreateProductInput {
  name: string;
  brand?: string;
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
  sizes: Array<{
    size: string;
    quantity: number;
  }>;
  measurements?: Record<string, string>;
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
    brand: string | null;
    category: string | null;
    description: string | null;
    purchasePrice: number;
    dropPrice: number;
    recommendedPrice: number | null;
    photoUrls: string[];
    isPremium: boolean;
    isActive: boolean;
    isInStock: boolean;
    expectedArrivalDate: string | null;
    measurements: Record<string, string> | null;
    createdAt: string;
    updatedAt: string;
    sizes: Array<{ id: string; size: string; currentQuantity: number; initialQuantity: number }>;
    totalStock: number;
    totalInitial: number;
  };
  sales: {
    total: number;
    completed: number;
    cancelled: number;
    revenue: number;
    avgPrice: number;
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
  brand?: string | null;
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
  sizes?: Array<{ size: string; quantity: number }>;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "products"] });
    },
  });
}

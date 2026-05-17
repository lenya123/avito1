"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FilterState } from "@/components/client/product-filters";

interface ProductsResponse {
  products: ProductWithExtras[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FilterOption {
  value: string;
  count: number;
}

interface FiltersResponse {
  categories: FilterOption[];
  brands: FilterOption[];
  sizes: FilterOption[];
  totalProducts: number;
}

interface ProductWithExtras {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  drop_price: number;
  purchase_price: number;
  recommended_price: number | null;
  photo_urls: string[] | null;
  photo_main_index: number | null;
  measurements: unknown;
  is_premium: boolean;
  is_active: boolean;
  is_in_stock: boolean;
  expected_arrival_date: string | null;
  created_at: string;
  sizes?: Array<{
    id: string;
    size: string;
    current_quantity: number;
    reserved_quantity: number;
  }>;
  isFavorite?: boolean;
  availableSizes?: string[];
}

interface ProductDetailsResponse {
  product: ProductWithExtras & {
    isNotificationEnabled?: boolean;
    sizesWithAvailability?: Array<{
      id: string;
      size: string;
      available: number;
      isAvailable: boolean;
    }>;
  };
}

async function fetchProducts(
  filters: Partial<FilterState>,
  page: number = 1
): Promise<ProductsResponse> {
  const params = new URLSearchParams();

  params.set("page", String(page));

  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.size) params.set("size", filters.size);
  if (filters.inStock) params.set("inStock", "true");
  if (filters.favorites) params.set("favorites", "true");
  if (filters.premiumOnly) params.set("premiumOnly", "true");
  if (filters.sort) params.set("sort", filters.sort);

  const response = await fetch(`/api/products?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch products");
  }

  return response.json();
}

async function fetchFilters(filters: Partial<FilterState>): Promise<FiltersResponse> {
  const params = new URLSearchParams();

  if (filters.category) params.set("category", filters.category);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.size) params.set("size", filters.size);
  if (filters.search) params.set("search", filters.search);
  if (filters.inStock) params.set("inStock", "true");

  const response = await fetch(`/api/products/filters?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch filters");
  }

  return response.json();
}

async function fetchProduct(id: string): Promise<ProductDetailsResponse> {
  const response = await fetch(`/api/products/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch product");
  }

  return response.json();
}

async function toggleFavorite(productId: string, isFavorite: boolean): Promise<void> {
  const response = await fetch(`/api/products/${productId}/favorite`, {
    method: isFavorite ? "POST" : "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to toggle favorite");
  }
}

async function toggleNotification(productId: string, enabled: boolean): Promise<void> {
  const response = await fetch(`/api/products/${productId}/notify`, {
    method: enabled ? "POST" : "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to toggle notification");
  }
}

export function useProducts(filters: Partial<FilterState>, page: number = 1) {
  return useQuery({
    queryKey: ["products", filters, page],
    queryFn: () => fetchProducts(filters, page),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useProductFilters(filters: Partial<FilterState> = {}) {
  return useQuery({
    queryKey: ["productFilters", filters.category, filters.brand, filters.search, filters.inStock],
    queryFn: () => fetchFilters(filters),
    staleTime: 30 * 1000, // 30 seconds (чаще обновляем при изменении фильтров)
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => (id ? fetchProduct(id) : null),
    enabled: !!id,
    staleTime: 0, // Всегда рефетчим для актуальных данных о размерах
    refetchOnWindowFocus: true, // Обновляем при возврате на вкладку
    refetchOnMount: "always", // Всегда рефетчим при монтировании
  });
}

export function useFavoriteToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, isFavorite }: { productId: string; isFavorite: boolean }) =>
      toggleFavorite(productId, isFavorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
    },
  });
}

export function useNotificationToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, enabled }: { productId: string; enabled: boolean }) =>
      toggleNotification(productId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product"] });
    },
  });
}

export function useInfiniteProducts(filters: Partial<FilterState>) {
  return useInfiniteQuery({
    queryKey: ["infiniteProducts", filters],
    queryFn: ({ pageParam = 1 }) => fetchProducts(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    staleTime: 30 * 1000,
    refetchOnMount: "always", // ВАЖНО: Обновляем при возврате на страницу для актуальных данных о доступности
  });
}

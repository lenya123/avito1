import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ShipperListItem {
  id: string;
  telegramId: number | null;
  telegramUsername: string | null;
  name: string | null;
  phone: string | null;
  login: string | null;
  workDays: number[] | null;
  createdAt: string;
  today: {
    shipped: number;
    returned: number;
  };
  month: {
    shipped: number;
    returned: number;
    earnings: number;
  };
}

export interface ShippersListResponse {
  shippers: ShipperListItem[];
  totalToday: {
    shipped: number;
    earnings: number;
  };
}

async function fetchShippers(): Promise<ShippersListResponse> {
  const response = await fetch("/api/owner/shippers");
  if (!response.ok) {
    throw new Error("Ошибка загрузки отправщиков");
  }
  return response.json();
}

export function useOwnerShippers() {
  return useQuery({
    queryKey: ["owner", "shippers"],
    queryFn: fetchShippers,
    staleTime: 30000,
  });
}

// Создание отправщика
interface CreateShipperInput {
  name: string;
  telegramUsername?: string;
  phone?: string;
  login: string;
  password: string;
}

async function createShipper(data: CreateShipperInput) {
  const response = await fetch("/api/owner/shippers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка создания отправщика");
  }

  return response.json();
}

export function useCreateShipper() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createShipper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "shippers"] });
    },
  });
}

// Обновление отправщика
interface UpdateShipperInput {
  shipperId: string;
  name?: string;
  telegramUsername?: string;
  phone?: string;
  workDays?: number[];
}

async function updateShipper({ shipperId, ...data }: UpdateShipperInput) {
  const response = await fetch(`/api/owner/shippers/${shipperId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка обновления отправщика");
  }

  return response.json();
}

export function useUpdateShipper() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateShipper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "shippers"] });
    },
  });
}

// Удаление отправщика
async function deleteShipper(shipperId: string) {
  const response = await fetch(`/api/owner/shippers/${shipperId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка удаления отправщика");
  }

  return response.json();
}

export function useDeleteShipper() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteShipper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "shippers"] });
    },
  });
}

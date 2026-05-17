"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PickupPoint } from "@/types/database";

async function fetchPickupPoints(deliveryService?: string): Promise<PickupPoint[]> {
  const url = new URL("/api/shipper/pickup-points", window.location.origin);
  if (deliveryService) url.searchParams.set("delivery_service", deliveryService);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Ошибка загрузки ПВЗ");
  const data = await res.json();
  return data.pickupPoints ?? [];
}

async function createPickupPoint(payload: {
  delivery_service: string;
  address: string;
  city?: string;
}): Promise<PickupPoint> {
  const res = await fetch("/api/shipper/pickup-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Ошибка создания ПВЗ");
  }
  const data = await res.json();
  return data.pickupPoint;
}

export function usePickupPoints(deliveryService?: string) {
  return useQuery({
    queryKey: ["pickup-points", deliveryService ?? "all"],
    queryFn: () => fetchPickupPoints(deliveryService),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePickupPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPickupPoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pickup-points"] });
    },
  });
}

async function deletePickupPoint(id: string): Promise<void> {
  const res = await fetch("/api/shipper/pickup-points", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Ошибка удаления ПВЗ");
  }
}

export function useDeletePickupPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePickupPoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pickup-points"] });
    },
  });
}

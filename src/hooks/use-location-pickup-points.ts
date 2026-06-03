import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// --- Types ---

interface PickupPoint {
  id: string;
  address: string;
  city?: string | null;
  deliveryService: string;
}

interface LocationPickupPoint {
  id: string;
  city: string;
  pickupPointId: string;
  address: string;
  deliveryService: string;
}

// --- Owner: all pickup points ---

async function fetchOwnerPickupPoints(deliveryService?: string): Promise<PickupPoint[]> {
  const params = deliveryService ? `?delivery_service=${deliveryService}` : "";
  const res = await fetch(`/api/owner/pickup-points${params}`);
  if (!res.ok) throw new Error("Ошибка загрузки пунктов");
  const data = await res.json();
  return (data.points || []).map((p: Record<string, unknown>) => ({
    id: p.id,
    address: p.address,
    city: p.city,
    deliveryService: p.delivery_service,
  }));
}

export function useOwnerPickupPoints(deliveryService?: string) {
  return useQuery({
    queryKey: ["owner", "pickup-points", deliveryService],
    queryFn: () => fetchOwnerPickupPoints(deliveryService),
    staleTime: 60000,
  });
}

// --- Owner: create pickup point ---

async function createPickupPoint(input: {
  address: string;
  city: string;
  deliveryService: string;
}) {
  const res = await fetch("/api/owner/pickup-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Ошибка создания пункта");
  }
  return res.json();
}

export function useCreatePickupPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPickupPoint,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "pickup-points"] });
    },
  });
}

// --- Owner: location pickup points (by city or all) ---

async function fetchLocationPickupPoints(city?: string): Promise<LocationPickupPoint[]> {
  const params = city ? `?city=${encodeURIComponent(city)}` : "";
  const res = await fetch(`/api/owner/location-pickup-points${params}`);
  if (!res.ok) throw new Error("Ошибка загрузки привязок");
  const data = await res.json();
  return data.points || [];
}

export function useLocationPickupPoints(city?: string) {
  return useQuery({
    queryKey: ["owner", "location-pickup-points", city],
    queryFn: () => fetchLocationPickupPoints(city),
    enabled: !!city,
    staleTime: 30000,
  });
}

export function useAllLocationPickupPoints() {
  return useQuery({
    queryKey: ["owner", "location-pickup-points"],
    queryFn: () => fetchLocationPickupPoints(),
    staleTime: 30000,
  });
}

// --- Owner: link/unlink pickup point to city ---

async function linkPickupPoint(input: { city: string; pickupPointId: string }) {
  const res = await fetch("/api/owner/location-pickup-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Ошибка привязки");
  }
  return res.json();
}

export function useLinkPickupPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: linkPickupPoint,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "location-pickup-points"] });
    },
  });
}

async function unlinkPickupPoint(id: string) {
  const res = await fetch("/api/owner/location-pickup-points", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Ошибка удаления привязки");
  }
  return res.json();
}

export function useUnlinkPickupPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unlinkPickupPoint,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "location-pickup-points"] });
    },
  });
}

// --- Client: pickup points for city ---

interface ClientPickupPoint {
  id: string;
  address: string;
  deliveryService: string;
}

async function fetchPickupPointsForCity(city: string): Promise<ClientPickupPoint[]> {
  const res = await fetch(`/api/pickup-points?city=${encodeURIComponent(city)}`);
  if (!res.ok) throw new Error("Ошибка загрузки пунктов");
  const data = await res.json();
  return data.points || [];
}

export function usePickupPointsForCity(city: string | null | undefined) {
  return useQuery({
    queryKey: ["pickup-points", city],
    queryFn: () => fetchPickupPointsForCity(city!),
    enabled: !!city,
    staleTime: 60000,
  });
}

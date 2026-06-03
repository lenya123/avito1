"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ProxyItem {
  id: string;
  proxyUrl: string;
  isActive: boolean;
  assignedTo: string | null;
  assignedSession: {
    userId: string;
    accountIndex: number;
    avitoLogin: string | null;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProxiesSummary {
  total: number;
  free: number;
  assigned: number;
  inactive: number;
}

interface ProxiesResponse {
  proxies: ProxyItem[];
  summary: ProxiesSummary;
}

interface AddProxiesResponse {
  added: number;
  total: number;
  duplicates: number;
  failed: string[];
}

async function fetchProxies(): Promise<ProxiesResponse> {
  const res = await fetch("/api/owner/proxies");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Ошибка загрузки прокси");
  }
  return res.json();
}

export function useOwnerProxies() {
  return useQuery({
    queryKey: ["owner-proxies"],
    queryFn: fetchProxies,
  });
}

export function useAddProxies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rawText: string): Promise<AddProxiesResponse> => {
      const res = await fetch("/api/owner/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка добавления");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-proxies"] });
    },
  });
}

export function useDeleteProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proxyId: string) => {
      const res = await fetch("/api/owner/proxies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка удаления");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-proxies"] });
    },
  });
}

export function useToggleProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ proxyId, isActive }: { proxyId: string; isActive: boolean }) => {
      const res = await fetch("/api/owner/proxies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyId, isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка обновления");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-proxies"] });
    },
  });
}

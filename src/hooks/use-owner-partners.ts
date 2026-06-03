import { useQuery } from "@tanstack/react-query";

export interface PartnerOption {
  id: string;
  name: string;
  tgUsername: string | null;
  isLinked: boolean;
  isActive: boolean;
  warehouseCity: string | null;
  acceptsVibeDebt: boolean;
}

async function fetchPartners(): Promise<PartnerOption[]> {
  const res = await fetch("/api/owner/partners", { credentials: "include" });
  if (!res.ok) throw new Error("Ошибка загрузки партнёров");
  const body = (await res.json()) as {
    partners: Array<{
      id: string;
      name: string;
      tgUsername: string | null;
      isLinked: boolean;
      isActive: boolean;
      warehouseCity?: string | null;
      acceptsVibeDebt?: boolean;
    }>;
  };
  return body.partners.map((p) => ({
    id: p.id,
    name: p.name,
    tgUsername: p.tgUsername,
    isLinked: p.isLinked,
    isActive: p.isActive,
    warehouseCity: p.warehouseCity ?? null,
    acceptsVibeDebt: p.acceptsVibeDebt ?? true,
  }));
}

/**
 * Список партнёров для выбора в форме товара.
 */
export function useOwnerPartnersList() {
  return useQuery({
    queryKey: ["owner", "partners", "list"],
    queryFn: fetchPartners,
    staleTime: 30_000,
  });
}

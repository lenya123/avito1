import { useQuery } from "@tanstack/react-query";
import type { Role } from "@/lib/roles/role-config";
import type { OwnerAnalyticsResponse, OwnerAnalyticsFilters } from "@/hooks/use-owner-analytics";

async function fetchRoleAnalytics(
  role: Role,
  filters: OwnerAnalyticsFilters
): Promise<OwnerAnalyticsResponse> {
  const params = new URLSearchParams();
  if (filters.period) params.set("period", filters.period);
  if (filters.granularity) params.set("granularity", filters.granularity);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.compare) params.set("compare", "true");

  // Stage 1.5: seller-роль вырезана, аналитика — только owner.
  void role;
  const response = await fetch(`/api/owner/analytics?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки аналитики");
  }
  return response.json();
}

export function useRoleAnalytics(role: Role, filters: OwnerAnalyticsFilters = {}) {
  return useQuery({
    queryKey: [role, "analytics", filters],
    queryFn: () => fetchRoleAnalytics(role, filters),
    staleTime: 60000,
  });
}

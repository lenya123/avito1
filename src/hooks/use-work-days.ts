import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WorkDaysData {
  workDays: number[] | null;
  minWorkDays: number;
}

export function useWorkDays() {
  return useQuery({
    queryKey: ["work-days"],
    queryFn: async () => {
      const response = await fetch("/api/shipper/work-days");
      if (!response.ok) throw new Error("Ошибка загрузки");
      return (await response.json()) as WorkDaysData;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetWorkDays() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workDays: number[]) => {
      const response = await fetch("/api/shipper/work-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workDays }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка сохранения");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-days"] });
      queryClient.invalidateQueries({ queryKey: ["shipper-stats"] });
    },
  });
}

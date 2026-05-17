import { useQuery } from "@tanstack/react-query";

export interface DashboardData {
  today: {
    orders: number;
    ordersChange: number;
    revenue: number;
    revenueChange: number;
    profit: number;
    profitChange: number;
    newClients: number;
    clientsChange: number;
  };
  weekChart: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  alerts: Array<{
    type: "urgent" | "warning";
    title: string;
    message: string;
    count: number;
    amount?: number;
  }>;
  debts: {
    total: number;
    count: number;
    list: Array<{
      id: string;
      username: string | null;
      debt: number;
    }>;
  };
  topProducts: Array<{
    id: string;
    name: string;
    photo: string | null;
    orders: number;
    revenue: number;
  }>;
  topClients: Array<{
    id: string;
    username: string | null;
    orders: number;
    revenue: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    price: number;
    createdAt: string;
    productName: string;
    productPhoto: string | null;
    clientUsername: string | null;
  }>;
  clientsStats: {
    total: number;
    active: number;
    premium: number;
    vibePlus: number;
  };
}

async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/owner/dashboard");
  if (!response.ok) {
    throw new Error("Ошибка загрузки данных");
  }
  return response.json();
}

export function useOwnerDashboard() {
  return useQuery({
    queryKey: ["owner", "dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 60000, // Обновляем каждую минуту
    staleTime: 30000,
  });
}

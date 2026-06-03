import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface ProductROI {
  id: string;
  name: string;
  category: string | null;
  photo: string | null;
  totalInvested: number;
  totalRevenue: number;
  unitsSold: number;
  paybackPercent: number;
  profit: number;
}

export interface FinanceFilters {
  days?: number;
  dateFrom?: string;
  dateTo?: string;
  /** §15: фильтр канала сбыта (all = свернуть, drop/avito = только этот). */
  channel?: "all" | "drop" | "avito";
}

export interface FinanceData {
  period: { days: number; startDate: string };
  summary: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    totalExpenses: number;
    totalPayouts: number;
    totalDebt: number;
    netProfit: number;
    /** Реальный кэш-инфлоу за период: оплаты заказов картой + +ВАЙБ-
     *  погашения (owner-route) + расчёты партнёров по комиссиям. */
    cashInflow: number;
    /** Разбивка cashInflow по источникам — для подписи в slim-сводке. */
    cashInflowBreakdown: { orders: number; vibe: number; partner: number };
    roi: number;
    completedOrders: number;
    totalOrders: number;
  };
  donutSegments: {
    invested: number;
    profit: number;
    expenses: number;
    payouts: number;
    debts: number;
  };
  /** Динамика по дням (МСК) текущего периода — канон §9.3/§9.4.
   *  Формат `ChartDataPoint` (общий с `SalesChart` — страница Заказов).
   *  `expenses` — Σ расходов за день (метрика «Расходы» на Финансах). */
  timeseries: Array<{
    date: string;
    label: string;
    orders: number;
    revenue: number;
    profit: number;
    invested: number;
    expenses: number;
  }>;
  /** Сравнение с прошлым периодом такой же длины. deltaPct=null — нет базы. */
  trendCompare: {
    revenue: { current: number; previous: number; deltaPct: number | null };
    profit: { current: number; previous: number; deltaPct: number | null };
  };
  expenses: Array<{
    id: string;
    amount: number;
    category: string;
    description: string | null;
    date: string;
  }>;
  expensesByCategory: Record<string, number>;
  expenseCategories: ExpenseCategory[];
  payouts: Array<{
    id: string;
    amount: number;
    shipperId: string;
    note: string | null;
    date: string;
  }>;
  debts: Array<{
    id: string;
    username: string | null;
    name: string | null;
    debt: number;
    limit: number | null;
    isVibePlus: boolean;
  }>;
  /** Касса — обязательства/ожидания владельца (§9.2 баланс + §7.4
   *  +ВАЙБ-долг + §10.4 партнёрский долг владельцу). */
  treasury: {
    customerBalanceOwed: number;
    vibeDebtTotal: number;
    partnerDebtOwed: number;
  };
  productROI: ProductROI[];
}

async function fetchFinance(filters: FinanceFilters): Promise<FinanceData> {
  const params = new URLSearchParams();
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  } else {
    params.set("days", String(filters.days || 30));
  }
  if (filters.channel && filters.channel !== "all") params.set("channel", filters.channel);
  const response = await fetch(`/api/owner/finance?${params}`);
  if (!response.ok) throw new Error("Ошибка загрузки финансов");
  return response.json();
}

export function useOwnerFinance(filters: FinanceFilters = { days: 30 }) {
  return useQuery({
    queryKey: ["owner", "finance", filters],
    queryFn: () => fetchFinance(filters),
    staleTime: 60000,
  });
}

// --- Mutations ---

interface CreateExpenseInput {
  amount: number;
  category: string;
  description?: string;
  expenseDate?: string;
}

interface CreatePayoutInput {
  shipperId: string;
  amount: number;
  note?: string;
}

async function postFinance(data: Record<string, unknown>) {
  const response = await fetch("/api/owner/finance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка");
  }
  return response.json();
}

async function deleteFinance(type: string, id: string) {
  const response = await fetch(`/api/owner/finance?type=${type}&id=${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка удаления");
  }
  return response.json();
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => postFinance({ type: "expense", ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner", "finance"] }),
  });
}

export function useCreatePayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePayoutInput) => postFinance({ type: "payout", ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner", "finance"] }),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFinance("expense", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner", "finance"] }),
  });
}

export function useDeletePayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFinance("payout", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner", "finance"] }),
  });
}

// --- Category mutations ---

async function fetchCategories(): Promise<ExpenseCategory[]> {
  const response = await fetch("/api/owner/finance/categories");
  if (!response.ok) throw new Error("Ошибка загрузки категорий");
  return response.json();
}

async function postCategory(data: { name: string; color?: string }) {
  const response = await fetch("/api/owner/finance/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка");
  }
  return response.json();
}

async function patchCategory(data: {
  id: string;
  name?: string;
  color?: string;
  sortOrder?: number;
}) {
  const response = await fetch("/api/owner/finance/categories", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка");
  }
  return response.json();
}

async function deleteCategory(id: string) {
  const response = await fetch(`/api/owner/finance/categories?id=${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка удаления");
  }
  return response.json();
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["owner", "finance", "categories"],
    queryFn: fetchCategories,
    staleTime: 300000,
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "finance"] });
    },
  });
}

export function useUpdateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "finance"] });
    },
  });
}

export function useDeleteExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "finance"] });
    },
  });
}

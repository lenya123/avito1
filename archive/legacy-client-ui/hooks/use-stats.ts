"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type StatsGranularity = "day" | "week" | "month";

export type StatsParams = {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  granularity?: StatsGranularity;
};

export type ChartDataPoint = {
  date: string;
  label: string;
  orders: number;
  revenue: number;
  profit: number;
  invested: number;
};

export type StatsResponse = {
  summary: {
    totalOrders: number;
    completedOrders: number;
    totalInvested: number;
    totalRevenue: number;
    totalProfit: number;
    roi: number;
    inProgress: {
      count: number;
      amount: number;
    };
  };
  chartData: ChartDataPoint[];
  granularity: StatsGranularity;
  dateFrom: string;
  dateTo: string;
};

async function fetchStats(params: StatsParams): Promise<StatsResponse> {
  const searchParams = new URLSearchParams();
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  if (params.granularity) searchParams.set("granularity", params.granularity);

  const response = await fetch(`/api/stats?${searchParams}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки статистики");
  }

  return response.json();
}

/**
 * Хук для загрузки статистики клиента
 * Доступно только для Premium пользователей
 */
export function useStats(params: StatsParams = {}, enabled: boolean = true) {
  return useQuery({
    queryKey: ["stats", params],
    queryFn: () => fetchStats(params),
    staleTime: 60 * 1000, // 1 минута
    enabled,
  });
}

// Leaderboard types
export type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  telegramUsername?: string;
  ordersCount: number;
  totalRevenue: number;
  isCurrentUser: boolean;
};

export type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  currentUserRank: number | null;
  currentUserEntry: LeaderboardEntry | null;
  totalParticipants: number;
  promotionCutoff: number;
  demotionCutoff: number;
  periodStart: string;
  periodEnd: string;
};

async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const response = await fetch("/api/leaderboard");

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки рейтинга");
  }

  return response.json();
}

/**
 * Хук для загрузки лидерборда
 * Доступно только для Premium пользователей
 */
export function useLeaderboard(enabled: boolean = true) {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    staleTime: 30 * 1000, // 30 секунд
    refetchInterval: 60 * 1000, // Обновляем каждую минуту
    enabled,
  });
}

/**
 * Отслеживает изменение ранга текущего пользователя через localStorage.
 * Положительное значение = поднялся, отрицательное = упал.
 */
export function useRankChange(currentRank: number | null): number | null {
  const [rankChange, setRankChange] = useState<number | null>(null);

  useEffect(() => {
    if (currentRank === null) return;
    const key = "leaderboard_last_rank";
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const { rank, week } = JSON.parse(stored);
        if (week === getWeekKey()) {
          setRankChange(rank - currentRank);
        }
      }
      localStorage.setItem(key, JSON.stringify({ rank: currentRank, week: getWeekKey() }));
    } catch {
      // localStorage недоступен (SSR, приватный режим)
    }
  }, [currentRank]);

  return rankChange;
}

function getWeekKey(): string {
  const now = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

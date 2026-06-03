"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/utils/cn";
import { Card } from "@/components/ui";
import { AnimatedNumber } from "@/components/shared/analytics/animated-number";
import { MiniSparkline } from "@/components/shared/analytics/mini-sparkline";
import { ProgressRing } from "@/components/shared/analytics/progress-ring";
import type { Role } from "@/lib/roles/role-config";

interface HeroCardProps {
  todayProfit: number;
  profitChange: number;
  profitSparkline: number[];
  monthlyTarget: number;
  monthlyProgress: number;
  role?: Role;
}

export function HeroCard({
  todayProfit,
  profitChange,
  profitSparkline,
  monthlyTarget,
  monthlyProgress,
  role = "owner",
}: HeroCardProps) {
  const queryClient = useQueryClient();

  // Optimistic local target override — reset when server data arrives
  const [localTarget, setLocalTarget] = useState<number | null>(null);
  useEffect(() => {
    setLocalTarget(null);
  }, [monthlyTarget]);
  const effectiveTarget = localTarget ?? monthlyTarget;
  const targetNotSet = effectiveTarget <= 0;

  const isPositive = profitChange >= 0;
  const monthPercent =
    effectiveTarget > 0 ? Math.min(100, Math.round((monthlyProgress / effectiveTarget) * 100)) : 0;

  // Pace indicator
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedMonthly = dayOfMonth > 0 ? (monthlyProgress / dayOfMonth) * daysInMonth : 0;
  const onTrack = projectedMonthly >= effectiveTarget;

  // Inline target editing
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    setEditValue(effectiveTarget > 0 ? String(effectiveTarget) : "");
    setIsEditing(true);
  };

  const handleSave = async () => {
    const newTarget = parseInt(editValue, 10);
    if (isNaN(newTarget) || newTarget <= 0) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    setLocalTarget(newTarget);
    setIsEditing(false);
    try {
      const res = await fetch("/api/owner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyProfitTarget: newTarget }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: [role, "dashboard"] });
      } else {
        setLocalTarget(null);
      }
    } catch {
      setLocalTarget(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setIsEditing(false);
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="relative p-5">
        {/* Background sparkline */}
        <div className="absolute bottom-0 right-0 w-[60%] opacity-40 pointer-events-none">
          <MiniSparkline
            data={profitSparkline}
            color="var(--accent-green)"
            width={200}
            height={60}
          />
        </div>

        <div className="relative flex items-center justify-between gap-4">
          {/* Left: profit number + delta */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/60 mb-1">Прибыль сегодня</p>
            <AnimatedNumber
              value={todayProfit}
              format={(n) => `${Math.round(n).toLocaleString("ru-RU")} ₽`}
              className="text-3xl font-bold text-white"
            />
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className={cn(
                  "text-sm font-medium",
                  isPositive ? "text-accent-green" : "text-accent-red"
                )}
              >
                {isPositive ? "+" : ""}
                {profitChange}%
              </span>
              <svg
                className={cn("w-3.5 h-3.5", isPositive ? "text-accent-green" : "text-accent-red")}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={isPositive ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}
                />
              </svg>
              <span className="text-2xs text-white/40">vs вчера</span>
            </div>
          </div>

          {/* Right: monthly target ring */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <ProgressRing
              value={monthPercent}
              size={64}
              strokeWidth={5}
              color={targetNotSet ? "var(--accent-orange)" : "var(--accent-green)"}
              showLabel
              labelOverride={targetNotSet ? "—" : `${monthPercent}%`}
            />
            {isEditing ? (
              <div className="flex items-center gap-1">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editValue}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setEditValue(raw);
                    }}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    disabled={isSaving}
                    placeholder="100000"
                    className="w-24 text-2xs text-center bg-white/[0.08] border border-glass rounded-lg pl-1.5 pr-8 py-1 text-white outline-none focus:border-accent-blue transition-colors"
                  />
                  <span className="absolute right-1.5 text-2xs text-white/40 pointer-events-none">
                    ₽
                  </span>
                </div>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !editValue || parseInt(editValue, 10) <= 0}
                  className="p-1 rounded-md bg-accent-green/20 text-accent-green hover:bg-accent-green/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Сохранить"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="p-1 rounded-md bg-white/[0.06] text-white/40 hover:bg-white/[0.10] hover:text-white/60 transition-colors"
                  title="Отмена"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : targetNotSet ? (
              <button
                onClick={handleStartEdit}
                className={cn(
                  "group flex items-center gap-1 px-2 py-1 rounded-lg transition-colors",
                  "bg-accent-orange/15 border border-accent-orange/25",
                  "hover:bg-accent-orange/20"
                )}
                title="Задать месячную цель"
              >
                <span className="text-2xs font-medium text-accent-orange">Задать цель</span>
                <svg
                  className="w-2.5 h-2.5 text-accent-orange"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleStartEdit}
                className="group flex items-center gap-1 hover:opacity-80 transition-opacity"
                title="Изменить цель"
              >
                <p className="text-2xs text-white/40 text-center">
                  Цель: {(effectiveTarget / 1000).toLocaleString("ru-RU")}K ₽/мес
                </p>
                <svg
                  className="w-2.5 h-2.5 text-white/20 group-hover:text-white/40 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            )}
            {!targetNotSet && (
              <p
                className={cn(
                  "text-2xs font-medium text-center",
                  onTrack ? "text-accent-green" : "text-accent-orange"
                )}
              >
                {onTrack ? "На пути к цели" : "Отстаём от цели"}
              </p>
            )}
            {targetNotSet && (
              <p className="text-2xs text-white/40 text-center max-w-[120px]">
                Поставь цель — увидишь прогресс
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HeroCardSkeleton() {
  return (
    <Card>
      <div className="p-5 animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="h-4 w-28 bg-white/10 rounded mb-2" />
            <div className="h-9 w-40 bg-white/10 rounded mb-2" />
            <div className="h-4 w-24 bg-white/10 rounded" />
          </div>
          <div className="w-16 h-16 rounded-full bg-white/10" />
        </div>
      </div>
    </Card>
  );
}

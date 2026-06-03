"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { type ShipperListItem } from "@/hooks/use-owner-shippers";

const DAY_LABELS: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  0: "Вс",
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function getScoreColor(score: number) {
  if (score >= 85)
    return {
      bg: "bg-accent-green/20",
      text: "text-accent-green",
      border: "border-accent-green/40",
    };
  if (score >= 60)
    return {
      bg: "bg-accent-orange/20",
      text: "text-accent-orange",
      border: "border-accent-orange/40",
    };
  return { bg: "bg-accent-red/20", text: "text-accent-red", border: "border-accent-red/40" };
}

interface ShipperCardProps {
  shipper: ShipperListItem;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
  baseUrl?: string;
}

export function ShipperCard({
  shipper,
  index,
  onEdit,
  onDelete,
  baseUrl = "/owner",
}: ShipperCardProps) {
  const score = Math.round(shipper.shipperScore ?? 65);
  const scoreColor = getScoreColor(score);

  return (
    <Link href={`${baseUrl}/shippers/${shipper.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        whileHover={{ scale: 1.005 }}
        className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card hover:border-glass-active transition-colors cursor-pointer"
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="flex items-start justify-between gap-4">
          {/* Основная информация */}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-b from-accent-purple/30 to-accent-purple/15 border border-accent-purple/20 flex items-center justify-center">
                <span className="text-accent-purple font-medium">
                  {shipper.name?.charAt(0).toUpperCase() || "?"}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-white">{shipper.name || "Без имени"}</h3>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-xl text-2xs font-medium border",
                      scoreColor.bg,
                      scoreColor.text,
                      scoreColor.border
                    )}
                  >
                    ELO {score}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/60">
                  {shipper.telegramUsername && <span>@{shipper.telegramUsername}</span>}
                  {shipper.phone && <span>{shipper.phone}</span>}
                </div>
                {/* Сегодня */}
                <p className="text-sm text-white/40 mt-1">
                  {shipper.today.ordersAvailable > 0 ? (
                    <>
                      <span className="text-white/80">{shipper.today.shipped}</span> из{" "}
                      {shipper.today.ordersAvailable} за сегодня
                    </>
                  ) : shipper.today.shipped > 0 ? (
                    <>
                      <span className="text-white/80">{shipper.today.shipped}</span> отправлено
                      сегодня
                    </>
                  ) : (
                    "Нет отправок сегодня"
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Действия */}
          <div className="flex flex-col gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit?.();
              }}
              aria-label="Редактировать"
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.();
              }}
              aria-label="Удалить"
              className="p-2 rounded-lg text-white/60 hover:text-accent-red hover:bg-red-500/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Рабочие дни и часы */}
        {shipper.workDays && shipper.workDays.length > 0 && (
          <div className="mt-3 pt-3 border-t border-glass">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-white/40">Рабочие дни</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-white/40">
                  {String(shipper.workHourStart ?? 9).padStart(2, "0")}:00 &mdash;{" "}
                  {String(shipper.workHourEnd ?? 18).padStart(2, "0")}:00
                </p>
                {/* Chevron */}
                <svg
                  className="w-4 h-4 text-white/20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
            <div className="flex gap-1">
              {DAY_ORDER.map((day) => {
                const isWork = shipper.workDays!.includes(day);
                const isToday = day === (new Date().getDay() === 0 ? 0 : new Date().getDay());
                return (
                  <span
                    key={day}
                    className={cn(
                      "flex-1 text-center py-1 rounded-lg text-2xs font-medium transition-colors",
                      isWork
                        ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/25"
                        : "bg-white/[0.03] text-white/20 border border-transparent",
                      isToday && "ring-1 ring-white/20"
                    )}
                  >
                    {DAY_LABELS[day]}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </Link>
  );
}

export function ShipperCardSkeleton() {
  return (
    <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-28 bg-white/10 rounded" />
              <div className="h-5 w-14 bg-white/10 rounded-xl" />
            </div>
            <div className="h-4 w-24 bg-white/10 rounded" />
            <div className="h-4 w-32 bg-white/10 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

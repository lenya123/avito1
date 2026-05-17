"use client";

import { motion } from "framer-motion";
import { type ShipperListItem } from "@/hooks/use-owner-shippers";

interface ShipperCardProps {
  shipper: ShipperListItem;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ShipperCard({ shipper, index, onEdit, onDelete }: ShipperCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.005 }}
      className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card hover:border-glass-active transition-colors"
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
            <div>
              <h3 className="font-medium text-white">{shipper.name || "Без имени"}</h3>
              <div className="flex items-center gap-2 text-sm text-white/60">
                {shipper.telegramUsername && <span>@{shipper.telegramUsername}</span>}
                {shipper.phone && <span>{shipper.phone}</span>}
              </div>
            </div>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {/* Сегодня */}
            <div className="p-3 rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl">
              <p className="text-xs text-white/60 mb-1">Сегодня</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-medium text-white">{shipper.today.shipped}</span>
                <span className="text-xs text-white/60">отправлено</span>
              </div>
              {shipper.today.returned > 0 && (
                <p className="text-xs text-accent-orange mt-1">
                  {shipper.today.returned} возвратов
                </p>
              )}
            </div>

            {/* За месяц */}
            <div className="p-3 rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl">
              <p className="text-xs text-white/60 mb-1">За месяц</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-medium text-white">{shipper.month.shipped}</span>
                <span className="text-xs text-white/60">отправлено</span>
              </div>
              <p className="text-xs text-accent-green mt-1">
                {shipper.month.earnings.toLocaleString()} ₽
              </p>
            </div>
          </div>
        </div>

        {/* Действия */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onEdit}
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
            onClick={onDelete}
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

      {/* Логин */}
      {shipper.login && (
        <div className="mt-3 pt-3 border-t border-glass">
          <p className="text-xs text-white/40">
            Логин: <span className="text-white/60">{shipper.login}</span>
          </p>
        </div>
      )}
    </motion.div>
  );
}

export function ShipperCardSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-5 w-32 bg-white/10 rounded" />
            <div className="h-4 w-24 bg-white/10 rounded" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="w-8 h-8 bg-white/10 rounded" />
          <div className="w-8 h-8 bg-white/10 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="h-20 bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass rounded-lg" />
        <div className="h-20 bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass rounded-lg" />
      </div>
    </div>
  );
}

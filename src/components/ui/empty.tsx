"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

export interface EmptyProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function Empty({ icon, title, description, action, className }: EmptyProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("flex flex-col items-center justify-center py-16 text-center", className)}
    >
      {icon && (
        <div className="text-5xl mb-4 opacity-50" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      {description && <p className="text-white/60 mb-6 max-w-sm">{description}</p>}
      {action}
    </motion.div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Что-то пошло не так",
  message = "Не удалось загрузить данные",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("flex flex-col items-center justify-center py-16 text-center", className)}
    >
      <div className="text-5xl mb-4" aria-hidden="true">
        😵
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-white/60 mb-6 max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className={cn(
            "px-4 py-2.5 rounded-xl",
            "bg-accent-blue text-white font-semibold",
            "hover:opacity-90 transition-opacity",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          )}
        >
          Попробовать снова
        </button>
      )}
    </motion.div>
  );
}

// Common empty state presets
export const EmptyPresets = {
  orders: {
    icon: "📦",
    title: "Нет заказов",
    description: "Ваши заказы появятся здесь после оформления",
  },
  products: {
    icon: "🛍️",
    title: "Товары не найдены",
    description: "Попробуйте изменить фильтры или поисковый запрос",
  },
  notifications: {
    icon: "🔔",
    title: "Нет уведомлений",
    description: "Здесь будут появляться важные уведомления",
  },
  search: {
    icon: "🔍",
    title: "Ничего не найдено",
    description: "Попробуйте изменить поисковый запрос",
  },
  clients: {
    icon: "👥",
    title: "Нет клиентов",
    description: "Клиенты появятся после регистрации в системе",
  },
} as const;

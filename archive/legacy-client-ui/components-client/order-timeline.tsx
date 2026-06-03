"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/hooks/use-orders";

export interface TimelineEvent {
  status: OrderStatus;
  timestamp: string;
  comment?: string;
}

export interface OrderTimelineProps {
  events: TimelineEvent[];
  currentStatus: OrderStatus;
  className?: string;
}

// Основной порядок статусов для timeline (успешный путь)
const STATUS_ORDER: OrderStatus[] = ["awaiting_shipment", "collecting", "in_transit", "completed"];

// Альтернативные пути
const RETURN_STATUSES: OrderStatus[] = ["return_in_transit", "return_arrived", "return_completed"];
const TERMINAL_STATUSES: OrderStatus[] = ["cancelled", "problem", "trash", "disposed"];

// Финальные статусы — пульсация не нужна (заказ завершён)
const FINAL_STATUSES: OrderStatus[] = ["completed", "return_completed", ...TERMINAL_STATUSES];

// Иконки для статусов
const STATUS_ICONS: Record<OrderStatus, React.ReactNode> = {
  awaiting_shipment: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  collecting: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  ),
  in_transit: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
      />
    </svg>
  ),
  completed: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  return_in_transit: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
      />
    </svg>
  ),
  return_arrived: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  ),
  return_completed: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  cancelled: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  problem: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  ),
  disposed: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  ),
};

// Цвета для пройденных шагов — приглушённый зелёный (прогресс виден, но не отвлекает)
const COMPLETED_STEP_COLOR = {
  bg: "bg-accent-green/10",
  text: "text-accent-green/40",
  border: "border-accent-green/20",
  hex: "#30D158",
};
const RETURN_STEP_COLOR = {
  bg: "bg-accent-orange/10",
  text: "text-accent-orange/40",
  border: "border-accent-orange/20",
  hex: "#FF9F0A",
};

// Цвет для текущего шага — яркий зелёный с glow (главный фокус)
const CURRENT_STEP_COLOR = {
  bg: "bg-accent-green/20",
  text: "text-accent-green",
  border: "border-accent-green/60",
  hex: "#30D158",
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderTimeline({ events, currentStatus, className }: OrderTimelineProps) {
  // Создаём map событий по статусу
  const eventMap = new Map<OrderStatus, TimelineEvent>();
  events.forEach((e) => eventMap.set(e.status, e));

  // Определяем, какой путь статусов показывать
  const isReturn = RETURN_STATUSES.includes(currentStatus);
  const isTerminal = TERMINAL_STATUSES.includes(currentStatus);
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);

  // Формируем список статусов для отображения
  let displayStatuses: OrderStatus[];

  if (isReturn) {
    // Для возвратов: показываем основной путь до момента возврата + статусы возврата
    const passedStatuses = STATUS_ORDER.filter((s) => eventMap.has(s));
    const returnStatuses = RETURN_STATUSES.filter(
      (s) =>
        eventMap.has(s) ||
        s === currentStatus ||
        RETURN_STATUSES.indexOf(s) < RETURN_STATUSES.indexOf(currentStatus)
    );
    displayStatuses = [...passedStatuses, ...returnStatuses];
  } else if (isTerminal) {
    // Показываем пройденные статусы + терминальный
    const passedStatuses = STATUS_ORDER.filter((s) => eventMap.has(s));
    displayStatuses = [...passedStatuses, currentStatus];
  } else {
    // Показываем все основные статусы
    displayStatuses = STATUS_ORDER;
  }

  return (
    <div className={cn("relative", className)}>
      <div className="space-y-0">
        {displayStatuses.map((status, index) => {
          const event = eventMap.get(status);
          const isPast = event !== undefined;
          const isCurrent = status === currentStatus;
          const isFuture = !isPast && !isCurrent && currentIndex < STATUS_ORDER.indexOf(status);
          const isLast = index === displayStatuses.length - 1;
          const isReturnStatus = RETURN_STATUSES.includes(status);

          // Определяем цвета: пройденные — зелёный (или оранжевый для возвратов), текущий — белый
          const pastColors = isReturnStatus ? RETURN_STEP_COLOR : COMPLETED_STEP_COLOR;

          return (
            <motion.div
              key={status}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative flex gap-4"
            >
              {/* Линия — прогресс-стиль */}
              {!isLast && (
                <div
                  className={cn(
                    "absolute left-[17px] top-[36px] w-0.5 h-[calc(100%-12px)]",
                    "rounded-full"
                  )}
                  style={{
                    background:
                      isPast && !isCurrent
                        ? `linear-gradient(to bottom, ${pastColors.hex}30, ${pastColors.hex}10)`
                        : "rgba(255,255,255,0.08)",
                  }}
                />
              )}

              {/* Иконка — стеклянный bubble */}
              <motion.div
                {...(isCurrent && !FINAL_STATUSES.includes(status)
                  ? {
                      animate: {
                        boxShadow: [
                          "0 0 12px rgba(48,209,88,0.4), 0 0 4px rgba(48,209,88,0.2)",
                          "0 0 20px rgba(48,209,88,0.6), 0 0 8px rgba(48,209,88,0.3)",
                          "0 0 12px rgba(48,209,88,0.4), 0 0 4px rgba(48,209,88,0.2)",
                        ],
                      },
                      transition: {
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }
                  : {})}
                className={cn(
                  "relative z-10 flex items-center justify-center w-9 h-9 rounded-xl transition-all",
                  "backdrop-blur-sm",
                  isCurrent &&
                    cn(
                      CURRENT_STEP_COLOR.bg,
                      CURRENT_STEP_COLOR.border,
                      CURRENT_STEP_COLOR.text,
                      "border",
                      "shadow-[0_0_12px_rgba(48,209,88,0.4),0_0_4px_rgba(48,209,88,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]"
                    ),
                  isPast &&
                    !isCurrent &&
                    cn(pastColors.bg, pastColors.border, pastColors.text, "border"),
                  isFuture &&
                    cn(
                      "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
                      "border border-glass-subtle",
                      "text-white/20"
                    )
                )}
              >
                {STATUS_ICONS[status]}
              </motion.div>

              {/* Контент */}
              <div className="flex-1 pb-6">
                {/* Первая строка — выравнивается по центру иконки */}
                <div className="h-9 flex items-center">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span
                      className={cn(
                        "font-medium text-sm",
                        isCurrent && CURRENT_STEP_COLOR.text,
                        isPast && !isCurrent && pastColors.text,
                        isFuture && "text-white/40"
                      )}
                    >
                      {ORDER_STATUS_LABELS[status]}
                    </span>
                    {event && (
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-md",
                          "bg-white/[0.06]",
                          "text-white/40"
                        )}
                      >
                        {formatDateTime(event.timestamp)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Дополнительный контент — под иконкой */}
                {event?.comment && <p className="mt-1.5 text-sm text-white/60">{event.comment}</p>}
                {isFuture && <p className="mt-1 text-xs text-white/20">Ожидается</p>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export type { OrderStatus };

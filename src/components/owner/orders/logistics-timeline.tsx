/**
 * Таймлайн логистики заказа (ТЗ Авито-заказы §8.3).
 *
 * Рендерит вертикальный стек точек со временем по полям-снапшотам:
 *   paid_at → sent_at → delivered_at (Авито) → return_initiated_at →
 *   return_arrived_at → return_completed_at
 *
 * Для дроп-заказа: paid_at → sent_at → return_* (delivered_at NULL).
 * Для Авито: добавляется delivered, return_in_transit имеет промежуточную
 * точку (return_initiated_at = когда покупатель оформил возврат на Avito).
 */

"use client";

import { cn } from "@/utils/cn";

interface TimelinePoint {
  label: string;
  iso: string | null;
  done: boolean;
  current?: boolean;
}

interface LogisticsTimelineProps {
  order: {
    source: string | null;
    status: string | null;
    paid_at: string | null;
    shipped_at?: string | null;
    sent_at?: string | null;
    delivered_at?: string | null;
    return_initiated_at?: string | null;
    return_arrived_at?: string | null;
    return_completed_at?: string | null;
  };
  /** compact — горизонтальная полоса для Shipper PWA. */
  compact?: boolean;
}

const ACTIVE_STATUSES_BY_POINT: Record<string, string[]> = {
  paid: ["paid", "collecting", "awaiting_size"],
  sent: ["sent"],
  delivered: ["delivered"],
  return_initiated: ["return_in_transit"],
  return_arrived: ["return"],
  return_completed: ["return_done"],
};

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LogisticsTimeline({ order, compact }: LogisticsTimelineProps) {
  const isAvito = order.source === "avito";
  const status = order.status ?? "";

  // sent_at может называться shipped_at в старой схеме — поддерживаем оба.
  const sentAt = order.sent_at ?? order.shipped_at ?? null;

  const points: TimelinePoint[] = [
    {
      label: "Оплачен",
      iso: order.paid_at,
      done: !!order.paid_at,
      current: ACTIVE_STATUSES_BY_POINT.paid.includes(status),
    },
    {
      label: isAvito ? "Сдан в ПВЗ Авито" : "Отправлен",
      iso: sentAt,
      done: !!sentAt,
      current: ACTIVE_STATUSES_BY_POINT.sent.includes(status),
    },
  ];

  if (isAvito) {
    points.push({
      label: "Покупатель забрал",
      iso: order.delivered_at ?? null,
      done: !!order.delivered_at,
      current: ACTIVE_STATUSES_BY_POINT.delivered.includes(status),
    });
  }

  // Возвратная ветка показывается, если заказ её достиг.
  if (
    order.return_initiated_at ||
    order.return_arrived_at ||
    order.return_completed_at ||
    ["return", "return_in_transit", "return_done"].includes(status)
  ) {
    points.push({
      label: "Возврат инициирован",
      iso: order.return_initiated_at ?? null,
      done: !!order.return_initiated_at,
      current: ACTIVE_STATUSES_BY_POINT.return_initiated.includes(status),
    });
    points.push({
      label: "Возврат на ПВЗ",
      iso: order.return_arrived_at ?? null,
      done: !!order.return_arrived_at,
      current: ACTIVE_STATUSES_BY_POINT.return_arrived.includes(status),
    });
    points.push({
      label: "Возврат принят",
      iso: order.return_completed_at ?? null,
      done: !!order.return_completed_at,
      current: ACTIVE_STATUSES_BY_POINT.return_completed.includes(status),
    });
  }

  if (compact) {
    // Горизонтальная полоса для Shipper PWA — оплачен → собран → отправлен → у покупателя.
    return (
      <div className="flex items-center gap-1 py-2 px-3 rounded-lg bg-white/[0.04] border border-glass-minimal">
        {points.map((p, i) => (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full border",
                  p.done
                    ? "bg-accent-green border-accent-green"
                    : p.current
                      ? "bg-accent-blue border-accent-blue animate-pulse"
                      : "bg-transparent border-white/30"
                )}
              />
              <span
                className={cn(
                  "text-[10px] leading-tight whitespace-nowrap",
                  p.done ? "text-white/80" : p.current ? "text-accent-blue" : "text-white/30"
                )}
              >
                {p.label.split(" ")[0]}
              </span>
            </div>
            {i < points.length - 1 && (
              <span
                className={cn(
                  "flex-1 h-px mx-1.5 mt-[-12px]",
                  p.done ? "bg-accent-green/40" : "bg-white/15"
                )}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <section
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <h3 className="text-sm font-semibold text-white mb-3">Таймлайн логистики</h3>
      <ol className="space-y-3">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <span
                className={cn(
                  "w-3 h-3 rounded-full border-2",
                  p.done
                    ? "bg-accent-green border-accent-green"
                    : p.current
                      ? "bg-accent-blue border-accent-blue animate-pulse"
                      : "bg-transparent border-white/30"
                )}
              />
              {i < points.length - 1 && (
                <span
                  className={cn(
                    "w-px flex-1 mt-1",
                    p.done ? "bg-accent-green/40" : "bg-white/15"
                  )}
                  style={{ minHeight: 18 }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-sm",
                  p.done ? "text-white" : p.current ? "text-accent-blue" : "text-white/40"
                )}
              >
                {p.label}
              </div>
              {p.iso && <div className="text-xs text-white/50 mt-0.5">{fmtTime(p.iso)}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

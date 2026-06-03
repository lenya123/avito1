"use client";

import React, { memo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Badge } from "@/components/ui";
import type { ShipperOrder } from "@/hooks/use-shipper-orders";
import type { StockProductSize } from "@/hooks/use-shipper-stock";
import { ORDER_STATUS_LABELS, DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";
import type { OrderStatus } from "@/types/database";
import { LogisticsTimeline } from "@/components/owner/orders/logistics-timeline";

// ─── Types ──────────────────────────────────────────────────────────

export type OrderCardVariant = "collect" | "ship" | "returns" | "history";

interface OrderCardProps {
  order: ShipperOrder;
  variant: OrderCardVariant;
  selected: boolean;
  onSelect: (id: string) => void;
  onDispute?: (orderId: string, orderNumber: number) => void;
  onPickupResult?: (
    orderId: string,
    result: "picked_up" | "wrong_code" | "wrong_tracking" | "not_found"
  ) => void;
  availableSizes?: StockProductSize[];
  onSetSize?: (orderId: string, size: string, productSizeId: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatDeadline(
  deadline: string | null
): { text: string; overdue: boolean; today: boolean } | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return {
    text: `до ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`,
    overdue: diffDays < 0,
    today: diffDays === 0,
  };
}

// ─── Shared sub-components ──────────────────────────────────────────

type SelectionColor = "blue" | "red" | "orange";

const SELECTION_CHECKBOX: Record<SelectionColor, string> = {
  blue: "bg-[rgba(10,132,255,0.20)] border-[rgba(10,132,255,0.60)] text-[#0a84ff]",
  red: "bg-[rgba(255,69,58,0.20)] border-[rgba(255,69,58,0.60)] text-[#ff453a]",
  orange: "bg-[rgba(255,159,10,0.20)] border-[rgba(255,159,10,0.60)] text-[#ff9f0a]",
};

function Checkbox({ checked, color = "blue" }: { checked: boolean; color?: SelectionColor }) {
  return (
    <div className="flex items-start pt-0.5 flex-shrink-0">
      <div
        className={cn(
          "w-5 h-5 rounded-lg border flex items-center justify-center transition-colors",
          checked ? SELECTION_CHECKBOX[color] : "border-white/20 bg-white/[0.04]"
        )}
      >
        {checked && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </div>
  );
}

function Photo({ url, alt }: { url: string | null | undefined; alt: string }) {
  return (
    <div
      className={cn(
        "relative w-[56px] h-[56px] rounded-xl overflow-hidden flex-shrink-0",
        "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
        "border border-glass-subtle",
        "shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
      )}
    >
      {url ? (
        <Image src={url} alt={alt} fill className="object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

function LocationIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

// ─── Delivery Service Badge ─────────────────────────────────────────

const DELIVERY_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  // Авито: зелёный → голубой → фиолетовый (лого)
  avito: {
    bg: "bg-gradient-to-r from-[#97cf26]/40 via-[#00aaff]/30 to-[#965eeb]/40",
    text: "text-[#00aaff]",
    border: "border-[#00aaff]/40",
  },
  // Яндекс: красный → жёлтый (лого)
  yandex: {
    bg: "bg-gradient-to-r from-[#fc3f1d]/35 to-[#ffcc00]/35",
    text: "text-yellow-400",
    border: "border-yellow-500/40",
  },
  // СДЭК: зелёный → оливковый (лого)
  cdek: {
    bg: "bg-gradient-to-r from-[#00b33c]/35 to-[#8bc34a]/35",
    text: "text-[#30d158]",
    border: "border-[#30d158]/40",
  },
  // Почта России: синий → белый → красный (триколор)
  pochta: {
    bg: "bg-gradient-to-r from-[#0056a2]/35 via-[#ffffff]/20 to-[#d52b1e]/35",
    text: "text-blue-400",
    border: "border-blue-500/40",
  },
  // 5Post: оранжевый → фиолетовый (лого)
  "5post": {
    bg: "bg-gradient-to-r from-[#ff6600]/35 to-[#7b2d8e]/35",
    text: "text-[#ff8533]",
    border: "border-[#ff6600]/40",
  },
};

const DELIVERY_BADGE_FALLBACK = {
  bg: "bg-white/10",
  text: "text-white/70",
  border: "border-glass",
};

function DeliveryBadge({ service }: { service: string }) {
  const label = DELIVERY_SERVICE_LABELS[service] || service;
  const style = DELIVERY_BADGE_STYLES[service] || DELIVERY_BADGE_FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border animate-gradient-shift",
        style.bg,
        style.text,
        style.border
      )}
    >
      {label}
    </span>
  );
}

function AvitoBadge({ order }: { order: ShipperOrder }) {
  if (order.source !== "avito") return null;
  return (
    <Badge variant="info" size="sm">
      Авито
    </Badge>
  );
}

// ─── Variant: Collect ───────────────────────────────────────────────

function OrderName({ order }: { order: ShipperOrder }) {
  if (order.product?.name) return <>{order.product.name}</>;
  if (order.system_comment) return <>{order.system_comment}</>;
  if (order.avito_order_id) return <>Авито #{order.avito_order_id}</>;
  return <>Заказ #{order.order_number}</>;
}

/** Метка «🤝 от партнёра» — показываем для партнёрских заказов на складе
 *  владельца, чтобы отправщик понимал что товар брать из партнёрского
 *  стока, а не из своего. */
function PartnerLabel({ order }: { order: ShipperOrder }) {
  if (!order.partner) return null;
  return (
    <p className="text-[11px] text-accent-purple/90 truncate mb-0.5">
      🤝 от партнёра «{order.partner.name}»
    </p>
  );
}

/** Имя получателя: для Авито-заказов — avito_buyer_name, иначе telegram_username клиента */
function recipientName(order: ShipperOrder): string | null {
  if (order.source === "avito" && order.avito_buyer_name) return order.avito_buyer_name;
  return order.client?.telegram_username ?? null;
}

function CollectContent({
  order,
  availableSizes,
  onSetSize,
}: {
  order: ShipperOrder;
  availableSizes?: StockProductSize[];
  onSetSize?: (orderId: string, size: string, productSizeId: string) => void;
}) {
  const hasSizes = availableSizes && availableSizes.length > 0;
  const needsSize = !order.size && hasSizes;

  return (
    <>
      <Photo url={order.product?.photo_urls?.[0]} alt={order.product?.name || ""} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-white truncate mb-0.5">
          <OrderName order={order} />
        </p>
        <PartnerLabel order={order} />

        <div className="flex items-center gap-1.5 text-[13px] text-white/80 mb-1">
          {needsSize ? (
            <Badge variant="warning" size="sm">
              Выберите размер
            </Badge>
          ) : order.size ? (
            <span className="font-medium">{order.size}</span>
          ) : null}
          <DeliveryBadge service={order.delivery_service} />
        </div>

        <div className="flex items-center gap-2 text-[11px] text-white/50">
          <span>#{order.order_number}</span>
          {recipientName(order) && <span className="truncate">{recipientName(order)}</span>}
          {order.barcode_printed && order.status !== "problem" && (
            <Badge variant="success" size="sm">
              Распечатан
            </Badge>
          )}
          {(() => {
            const dl = formatDeadline(order.send_by);
            if (!dl) return null;
            return (
              <span
                className={cn(
                  "font-medium",
                  dl.overdue ? "text-accent-red" : dl.today ? "text-accent-orange" : "text-white/40"
                )}
              >
                {dl.text}
              </span>
            );
          })()}
        </div>

        {order.source === "avito" && order.avito_delivery_address && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-white/40">
            <LocationIcon />
            <span className="truncate">{order.avito_delivery_address}</span>
          </div>
        )}

        {/* Inline size selection for orders without size */}
        {needsSize && availableSizes && availableSizes.length > 0 && onSetSize && (
          <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {availableSizes.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={s.currentQuantity <= 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetSize(order.id, s.size, s.id);
                }}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl text-[12px] font-medium transition-all border",
                  s.currentQuantity > 0
                    ? "bg-accent-blue/15 border-accent-blue/30 text-white hover:bg-accent-blue/25 active:scale-95"
                    : "bg-white/[0.04] border-glass text-white/25 cursor-not-allowed"
                )}
              >
                {s.size}
                <span className="ml-0.5 text-[10px] opacity-60">({s.currentQuantity})</span>
              </button>
            ))}
          </div>
        )}

        {order.problem_type && (
          <div className="mt-1.5">
            <Badge variant={order.problem_type === "out_of_stock" ? "error" : "warning"} size="sm">
              {order.problem_type === "out_of_stock" ? "Нет в наличии" : "Трек не сканируется"}
            </Badge>
          </div>
        )}

        {order.system_comment && (
          <div className="mt-1.5 p-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
            <p className="text-[11px] text-accent-blue">{order.system_comment}</p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Variant: Ship ──────────────────────────────────────────────────

function ShipContent({ order }: { order: ShipperOrder }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[14px] font-semibold text-white truncate mb-0.5">
        <OrderName order={order} />
      </p>
      <PartnerLabel order={order} />

      <div className="flex items-center gap-1.5 text-[13px] text-white/80 mb-1">
        {order.size && <span className="font-medium">{order.size}</span>}
        <DeliveryBadge service={order.delivery_service} />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-white/50">
        <span>#{order.order_number}</span>
        <AvitoBadge order={order} />
        {recipientName(order) && <span className="truncate">{recipientName(order)}</span>}
        {order.isUrgent && (
          <Badge variant="warning" size="sm">
            Срочно
          </Badge>
        )}
      </div>

      {order.source === "avito" && order.avito_delivery_address && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-white/40">
          <LocationIcon />
          <span className="truncate">{order.avito_delivery_address}</span>
        </div>
      )}

      {order.pickup_point_address_snapshot && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-white/40">
          <LocationIcon />
          <span className="truncate">{order.pickup_point_address_snapshot}</span>
        </div>
      )}
    </div>
  );
}

// ─── Variant: Returns ───────────────────────────────────────────────

function ReturnsContent({
  order,
  onDispute,
  onPickupResult,
}: {
  order: ShipperOrder;
  onDispute?: (orderId: string, orderNumber: number) => void;
  onPickupResult?: (
    orderId: string,
    result: "picked_up" | "wrong_code" | "wrong_tracking" | "not_found"
  ) => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[14px] font-semibold text-white truncate mb-0.5">
        <OrderName order={order} />
      </p>
      <PartnerLabel order={order} />

      <div className="flex items-center gap-1.5 text-[13px] text-white/80 mb-0.5">
        {order.size && <span className="font-medium">{order.size}</span>}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-white/50 mb-1.5">
        <span>#{order.order_number}</span>
        <AvitoBadge order={order} />
        <Badge variant="default" size="sm">
          {ORDER_STATUS_LABELS[order.status as OrderStatus] || order.status}
        </Badge>
        {order.isUrgent && (
          <Badge variant="warning" size="sm">
            Срочно
          </Badge>
        )}
      </div>

      {/* Return code — large and prominent */}
      {order.return_code && (
        <div className="p-2.5 rounded-lg bg-accent-green/10 border border-accent-green/20">
          <div className="text-[10px] text-accent-green/60 uppercase tracking-wider mb-0.5">
            Код возврата
          </div>
          <p className="text-xl font-bold text-accent-green text-center tracking-widest">
            {order.return_code}
          </p>
        </div>
      )}

      {/* Link to Avito order page — to see pickup code */}
      {order.avito_order_id && (
        <a
          href={`https://www.avito.ru/profile/items/orders/${order.avito_order_id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-1.5 flex items-center justify-center gap-2 w-full p-2.5 rounded-lg bg-white/[0.06] border border-glass text-white/70 text-[12px] font-medium hover:bg-white/[0.1] active:scale-[0.98] transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Посмотреть код на Авито
        </a>
      )}

      {/* 4 кнопки результата попытки забора (BUSINESS_LOGIC §6.4). */}
      {onPickupResult && order.status === "return" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPickupResult(order.id, "picked_up");
            }}
            className="p-2 rounded-lg bg-accent-green/10 border border-accent-green/20 text-accent-green text-[11px] font-medium hover:bg-accent-green/20 transition-colors"
          >
            ✅ Забран
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPickupResult(order.id, "wrong_code");
            }}
            className="p-2 rounded-lg bg-accent-orange/10 border border-accent-orange/20 text-accent-orange text-[11px] font-medium hover:bg-accent-orange/20 transition-colors"
          >
            ❌ Неверный код
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPickupResult(order.id, "wrong_tracking");
            }}
            className="p-2 rounded-lg bg-accent-orange/10 border border-accent-orange/20 text-accent-orange text-[11px] font-medium hover:bg-accent-orange/20 transition-colors"
          >
            ❌ Неверный трек
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPickupResult(order.id, "not_found");
            }}
            className="p-2 rounded-lg bg-white/[0.06] border border-glass text-white/70 text-[11px] font-medium hover:bg-white/[0.1] transition-colors"
          >
            ❌ Нет на ПВЗ
          </button>
        </div>
      )}

      {/* Dispute button */}
      {onDispute && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDispute(order.id, order.order_number);
          }}
          className="mt-2 w-full p-2 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-[11px] font-medium hover:bg-accent-red/20 transition-colors"
        >
          ⚠️ Плохое качество
        </button>
      )}
    </div>
  );
}

// ─── Variant: History ────────────────────────────────────────────────

/** Badge variant for final statuses (канон §4.2: sent/return_done/cancelled/trash) */
function historyBadgeVariant(status: string): "success" | "warning" | "error" | "default" {
  if (status === "sent") return "success";
  if (status === "return_done") return "warning";
  if (status === "cancelled") return "error";
  return "default"; // trash
}

function HistoryContent({ order }: { order: ShipperOrder }) {
  const finishedDate = order.updated_at || order.created_at;

  return (
    <>
      <Photo url={order.product?.photo_urls?.[0]} alt={order.product?.name || ""} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-white/60 truncate mb-0.5">
          <OrderName order={order} />
        </p>
        <PartnerLabel order={order} />

        <div className="flex items-center gap-1.5 text-[13px] text-white/50 mb-1">
          {order.size && <span className="font-medium">{order.size}</span>}
          <DeliveryBadge service={order.delivery_service} />
        </div>

        <div className="flex items-center gap-2 text-[11px] text-white/40 flex-wrap">
          <span>#{order.order_number}</span>
          <Badge variant={historyBadgeVariant(order.status)} size="sm">
            {ORDER_STATUS_LABELS[order.status as OrderStatus] || order.status}
          </Badge>
          {order.tracking_number && <span className="font-mono">{order.tracking_number}</span>}
        </div>

        <div className="mt-1 text-[10px] text-white/30">{formatDate(finishedDate)}</div>
      </div>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export const OrderCard = memo(function OrderCard({
  order,
  variant,
  selected,
  onSelect,
  onDispute,
  onPickupResult,
  availableSizes,
  onSetSize,
}: OrderCardProps) {
  const isHistory = variant === "history";
  // История никогда не выбирается; остальные табы — выбираемы.
  const isSelectable = !isHistory;
  const showCheckbox = !isHistory;
  const selectionColor: SelectionColor =
    order.status === "problem" ? "red" : order.isUrgent ? "orange" : "blue";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.005 }}
      whileTap={isSelectable ? { scale: 0.995 } : undefined}
      onClick={isSelectable ? () => onSelect(order.id) : undefined}
      {...(isSelectable
        ? {
            role: "checkbox" as const,
            "aria-checked": selected,
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(order.id);
              }
            },
          }
        : {})}
      className={cn(
        "group relative rounded-2xl overflow-hidden",
        "backdrop-blur-xl",
        "shadow-card",
        "transition-all duration-150",
        isHistory
          ? "bg-gradient-to-b from-white/[0.04] to-white/[0.02] border border-glass opacity-75"
          : selected
            ? order.status === "problem"
              ? "bg-[rgba(255,69,58,0.08)] border-l-2 border-l-[#ff453a] border-r-2 border-r-[#ff453a] border-y border-y-[rgba(255,69,58,0.25)]"
              : order.isUrgent
                ? "bg-[rgba(255,159,10,0.08)] border-l-2 border-l-[#ff9f0a] border-r-2 border-r-[#ff9f0a] border-y border-y-[rgba(255,159,10,0.25)]"
                : "bg-[rgba(10,132,255,0.08)] border-l-2 border-l-[#0a84ff] border-r-2 border-r-[#0a84ff] border-y border-y-[rgba(10,132,255,0.25)]"
            : [
                "bg-gradient-to-b from-white/[0.08] to-white/[0.04] hover:from-white/[0.10] hover:to-white/[0.06]",
                "border border-glass hover:border-glass-active",
              ],
        isSelectable && "cursor-pointer",
        !selected &&
          order.status === "problem" &&
          "border border-[rgba(255,69,58,0.25)] hover:border-[rgba(255,69,58,0.35)] shadow-[inset_0_0_12px_rgba(255,69,58,0.08),0_0_8px_rgba(255,69,58,0.06)]"
      )}
    >
      {/* Диагональные полосы для problem-заказов */}
      {order.status === "problem" && (
        <div
          className="absolute inset-0 z-0 pointer-events-none rounded-2xl overflow-hidden"
          style={{
            background: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 8px,
              rgba(255, 69, 58, 0.18) 8px,
              rgba(255, 69, 58, 0.18) 16px
            )`,
          }}
        />
      )}

      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Внутренний градиент от боковых полос */}
      {selected &&
        (() => {
          const c =
            order.status === "problem" ? "255,69,58" : order.isUrgent ? "255,159,10" : "10,132,255";
          return (
            <>
              <div
                className="absolute inset-y-0 left-0 w-24 pointer-events-none"
                style={{
                  background: `linear-gradient(to right, rgba(${c},0.07), rgba(${c},0.03), transparent)`,
                }}
              />
              <div
                className="absolute inset-y-0 right-0 w-24 pointer-events-none"
                style={{
                  background: `linear-gradient(to left, rgba(${c},0.07), rgba(${c},0.03), transparent)`,
                }}
              />
            </>
          );
        })()}

      <div
        className={cn(
          "flex gap-3 p-3 w-full relative z-10",
          order.status === "problem" && "bg-[rgba(20,20,20,0.75)] rounded-2xl"
        )}
      >
        {showCheckbox && <Checkbox checked={selected} color={selectionColor} />}

        {variant === "collect" && (
          <CollectContent order={order} availableSizes={availableSizes} onSetSize={onSetSize} />
        )}
        {variant === "ship" && <ShipContent order={order} />}
        {variant === "returns" && (
          <ReturnsContent order={order} onDispute={onDispute} onPickupResult={onPickupResult} />
        )}
        {variant === "history" && <HistoryContent order={order} />}
      </div>
      {/* ТЗ §8.3: компактный таймлайн для Авито-заказов в ship/history
          вариантах. Показывает где сейчас заказ в цикле «оплачен →
          собран → отправлен → у покупателя». */}
      {order.source === "avito" && (variant === "ship" || variant === "history") && (
        <div className="px-3 pb-3 -mt-1">
          <LogisticsTimeline
            compact
            order={{
              source: order.source,
              status: order.status,
              paid_at: order.created_at,
              sent_at: order.shipped_at,
              delivered_at: null,
              return_initiated_at: null,
              return_arrived_at: null,
              return_completed_at: null,
            }}
          />
        </div>
      )}
    </motion.div>
  );
});

// ─── Skeleton ───────────────────────────────────────────────────────

export function OrderCardSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex gap-3 p-3 items-center">
        <div className="w-5 h-5 rounded-md bg-white/10 flex-shrink-0" />
        <div className="w-[56px] h-[56px] rounded-xl bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="h-4 w-3/4 bg-white/10 rounded" />
          <div className="h-3 w-full bg-white/10 rounded" />
          <div className="h-3 w-24 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}

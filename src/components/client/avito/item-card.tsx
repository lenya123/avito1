"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Badge, type BadgeVariant } from "@/components/ui";
import { Button } from "@/components/ui";

interface AvitoItemCardProps {
  title: string;
  price: number | null;
  status: string | null;
  url: string | null;
  imageUrl: string | null;
  views: number;
  favorites: number;
  contacts: number;
  orders?: number;
  viewsToday?: number;
  favoritesToday?: number;
  contactsToday?: number;
  ordersToday?: number;
  productPhotoUrl?: string | null;
  onLinkClick?: () => void;
  onPriceEditClick?: () => void;
  onToggleActive?: () => void;
  onDelete?: () => void;
  busy?: boolean;
}

const statusBadgeMap: Record<string, { variant: BadgeVariant; label: string; dot?: boolean }> = {
  active: { variant: "success", label: "Активно", dot: true },
  removed: { variant: "default", label: "Снято" },
  old: { variant: "default", label: "Архив" },
  blocked: { variant: "error", label: "Заблокировано" },
  rejected: { variant: "error", label: "Отклонено" },
};

// Стата с «(+N сегодня)» как на Avito
function Stat({
  icon,
  total,
  today,
  title,
}: {
  icon: string;
  total: number;
  today?: number;
  title: string;
}) {
  return (
    <span title={title}>
      {icon} {(total + (today ?? 0)).toLocaleString("ru")}
      {!!today && today > 0 && <span className="text-accent-green"> +{today}</span>}
    </span>
  );
}

export function AvitoItemCard({
  title,
  price,
  status,
  url,
  imageUrl,
  views,
  favorites,
  contacts,
  orders = 0,
  viewsToday,
  favoritesToday,
  contactsToday,
  ordersToday,
  productPhotoUrl,
  onLinkClick,
  onPriceEditClick,
  onToggleActive,
  onDelete,
  busy,
}: AvitoItemCardProps) {
  const displayImage = productPhotoUrl || imageUrl;
  const isLinked = !!productPhotoUrl;
  const isActive = status === "active";

  const stop = (fn?: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn?.();
  };

  return (
    <motion.a
      href={url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative block rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04] backdrop-blur-xl",
        "border border-glass-minimal shadow-card",
        "transition-all duration-200",
        "hover:border-white/20 hover:bg-white/[0.10]"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent z-10" />
      <div className="aspect-[4/3] bg-white/5 relative">
        {displayImage ? (
          <Image
            src={displayImage}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-4xl">
            📦
          </div>
        )}
        {status && statusBadgeMap[status] && (
          <Badge
            variant={statusBadgeMap[status].variant}
            size="sm"
            dot={statusBadgeMap[status].dot}
            className="absolute top-2 right-2 z-10"
          >
            {statusBadgeMap[status].label}
          </Badge>
        )}
      </div>

      <div className="p-3">
        <h3 className="text-sm font-medium text-white line-clamp-2 leading-tight">{title}</h3>
        {price != null && (
          <p className="text-lg font-bold text-white mt-1">{price.toLocaleString("ru")} ₽</p>
        )}
        {/* Stats: показы / избранное / контакты / заказали — с (+сегодня) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-white/80">
          <Stat icon="👁" total={views} today={viewsToday} title="Просмотры" />
          <Stat icon="❤️" total={favorites} today={favoritesToday} title="Избранное" />
          <Stat icon="📝" total={contacts} today={contactsToday} title="Контакты" />
          <Stat icon="🛒" total={orders} today={ordersToday} title="Заказали" />
        </div>

        {/* Действия */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {onPriceEditClick && (
            <Button variant="secondary" size="sm" onClick={stop(onPriceEditClick)} disabled={busy}>
              Цена
            </Button>
          )}
          {onToggleActive && (
            <Button
              variant="secondary"
              size="sm"
              onClick={stop(onToggleActive)}
              disabled={busy}
              className={isActive ? "text-accent-orange" : "text-accent-green"}
            >
              {isActive ? "Выключить" : "Включить"}
            </Button>
          )}
          {onLinkClick && (
            <Button
              variant="secondary"
              size="sm"
              onClick={stop(onLinkClick)}
              disabled={busy}
              className={cn("flex-1 min-w-[80px]", isLinked && "text-accent-orange")}
            >
              {isLinked ? "Привязка" : "Привязать"}
            </Button>
          )}
          {onDelete && (
            <Button
              variant="secondary"
              size="sm"
              onClick={stop(onDelete)}
              disabled={busy}
              className="text-accent-red"
            >
              Удалить
            </Button>
          )}
        </div>
      </div>
    </motion.a>
  );
}

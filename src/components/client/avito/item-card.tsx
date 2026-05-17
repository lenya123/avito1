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
  viewsToday?: number;
  favoritesToday?: number;
  contactsToday?: number;
  productPhotoUrl?: string | null;
  onLinkClick?: () => void;
  onPriceEditClick?: () => void;
}

const statusBadgeMap: Record<string, { variant: BadgeVariant; label: string; dot?: boolean }> = {
  removed: { variant: "default", label: "Снято" },
  old: { variant: "default", label: "Архив" },
  blocked: { variant: "error", label: "Заблокировано" },
  rejected: { variant: "error", label: "Отклонено" },
};

export function AvitoItemCard({
  title,
  price,
  status,
  url,
  imageUrl,
  views,
  favorites,
  contacts,
  viewsToday,
  favoritesToday,
  contactsToday,
  productPhotoUrl,
  onLinkClick,
  onPriceEditClick,
}: AvitoItemCardProps) {
  const displayImage = productPhotoUrl || imageUrl;
  const isLinked = !!productPhotoUrl;

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
      {/* Image */}
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

      {/* Content */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-white line-clamp-2 leading-tight">{title}</h3>
        {price != null && (
          <p className="text-lg font-bold text-white mt-1">{price.toLocaleString("ru")} ₽</p>
        )}
        {/* Stats */}
        <div className="flex items-center gap-3 mt-2 text-xs text-white/80">
          <span title="Просмотры">
            👁 {(views + (viewsToday ?? 0)).toLocaleString("ru")}
            {!!viewsToday && <span className="text-accent-green"> +{viewsToday}</span>}
          </span>
          <span title="Избранное">
            ❤️ {(favorites + (favoritesToday ?? 0)).toLocaleString("ru")}
            {!!favoritesToday && <span className="text-accent-green"> +{favoritesToday}</span>}
          </span>
          <span title="Контакты">
            📝 {(contacts + (contactsToday ?? 0)).toLocaleString("ru")}
            {!!contactsToday && <span className="text-accent-green"> +{contactsToday}</span>}
          </span>
        </div>

        {/* Action buttons */}
        {(onLinkClick || onPriceEditClick) && (
          <div className="flex gap-1.5 mt-2">
            {onLinkClick && (
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLinkClick();
                }}
                className={cn("flex-1", isLinked && "text-accent-orange")}
              >
                {isLinked ? "Привязка" : "Привязать"}
              </Button>
            )}
            {onPriceEditClick && (
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPriceEditClick();
                }}
              >
                Цена
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.a>
  );
}

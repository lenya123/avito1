"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import type { ProductSellerSummary } from "@/hooks/use-products";
import { hasDisplayableRating, ratingToStars } from "@/lib/seller/rating";

const SLA_CAPTION = "SLA-рейтинг: скорость работы, % успешных заказов";

export function SellerChip({ seller }: { seller: ProductSellerSummary }) {
  const router = useRouter();
  const canShowRating = hasDisplayableRating(seller.ordersCount);
  const stars = ratingToStars(seller.rating);

  return (
    <Card variant="glass" padding="md" hoverable onClick={() => router.push(`/shop/${seller.id}`)}>
      <div className="flex items-center gap-3">
        <Avatar src={seller.avatar_url} name={seller.shop_name} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="text-white/50 text-2xs uppercase tracking-wide">Продавец</div>
          <div className="text-white font-semibold truncate">{seller.shop_name}</div>
          {canShowRating ? (
            <>
              <div className="flex items-center gap-2 mt-1" title={SLA_CAPTION}>
                <RatingStars value={stars} />
                <span className="text-white/50 text-xs">{seller.ordersCount} заказов</span>
              </div>
              <div className="text-white/40 text-2xs mt-0.5">{SLA_CAPTION}</div>
            </>
          ) : (
            <div className="text-white/50 text-xs mt-1">Новый продавец</div>
          )}
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/40 shrink-0"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Card>
  );
}

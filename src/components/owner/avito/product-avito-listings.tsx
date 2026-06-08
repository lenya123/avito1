"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";

/**
 * Блок «Авито-объявления» на карточке товара (ТЗ §3.2): read-only список
 * объявлений, привязанных к этому товару, с кнопкой отвязки. Обратный маппинг
 * avito_item_product_mapping → avito_items через /api/avito/products/{id}/listings.
 */
interface Listing {
  avito_item_id: number;
  title: string | null;
  price: number | null;
  status: string | null;
  url: string | null;
  image_url: string | null;
  views: number | null;
  favorites: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Активно",
  old: "Снято",
  inactive: "Неактивно",
  removed: "Удалено",
  blocked: "Заблокировано",
  rejected: "Отклонено",
};

export function ProductAvitoListings({ productId }: { productId: string }) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [unlinking, setUnlinking] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/avito/products/${productId}/listings`);
      if (!res.ok) {
        setListings([]);
        return;
      }
      const data = await res.json();
      setListings(data.listings ?? []);
    } catch {
      setListings([]);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const unlink = async (avitoItemId: number) => {
    setUnlinking(avitoItemId);
    try {
      await fetch("/api/avito/items/link", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avito_item_id: avitoItemId }),
      });
      await load();
    } finally {
      setUnlinking(null);
    }
  };

  // Пока грузится — скелет; пусто — скрываем блок целиком (не засоряем карточку).
  if (listings === null) {
    return (
      <div className="rounded-2xl bg-white/[0.04] border border-glass-minimal p-4 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (listings.length === 0) return null;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <h3 className="text-sm font-semibold text-white mb-3">
        Авито-объявления · {listings.length}
      </h3>
      <div className="space-y-2">
        {listings.map((l) => (
          <div key={l.avito_item_id} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/5 shrink-0">
              {l.image_url ? (
                <Image
                  src={l.image_url}
                  alt=""
                  width={36}
                  height={36}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                  📦
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={l.url || `https://www.avito.ru/${l.avito_item_id}`}
                target="_blank"
                className="text-sm text-white/85 line-clamp-1 hover:text-white transition-colors"
              >
                {l.title || `#${l.avito_item_id}`}
              </Link>
              <div className="flex items-center gap-2 text-xs text-white/50 mt-0.5">
                {l.price != null && <span>{l.price.toLocaleString("ru")} ₽</span>}
                <span>{STATUS_LABEL[l.status ?? ""] ?? l.status}</span>
                <span>👁 {(l.views ?? 0).toLocaleString("ru")}</span>
              </div>
            </div>
            <button
              onClick={() => unlink(l.avito_item_id)}
              disabled={unlinking === l.avito_item_id}
              className="text-xs text-white/40 hover:text-red-400 transition-colors shrink-0 px-2 py-1 disabled:opacity-50"
            >
              {unlinking === l.avito_item_id ? "…" : "Отвязать"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

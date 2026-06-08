"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { cn } from "@/utils/cn";
import { useAvitoItems } from "@/hooks/use-avito";

export function DashboardTopItems() {
  // Тянем все активные (до 200 — покрывает любой реальный магазин), чтобы рейтинг
  // считался по ВСЕМ товарам, а кнопка «Все» разворачивала полный список.
  const { data: itemsData } = useAvitoItems(1, 200, "active");
  const [showWorst, setShowWorst] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const sortedItems = useMemo(() => {
    if (!itemsData?.items) return [];
    const scored = itemsData.items.map((item) => ({
      ...item,
      score:
        ((item.contacts ?? 0) + (item.contacts_today ?? 0)) * 10 +
        ((item.favorites ?? 0) + (item.favorites_today ?? 0)) * 3 +
        ((item.views ?? 0) + (item.views_today ?? 0)),
    }));
    scored.sort((a, b) => (showWorst ? a.score - b.score : b.score - a.score));
    return scored;
  }, [itemsData, showWorst]);

  if (!itemsData || itemsData.items.length < 3) return null;

  // 5 по умолчанию, «Все» разворачивает полный рейтинг (универсально по числу).
  const visibleItems = showAll ? sortedItems : sortedItems.slice(0, 5);

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Рейтинг товаров</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setShowWorst(false)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium whitespace-nowrap",
              "backdrop-blur-xl border transition-all duration-200 rounded-xl",
              !showWorst
                ? [
                    "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                    "text-white border-glass-strong",
                    "shadow-glass-inset",
                  ]
                : [
                    "bg-white/[0.06] text-white/60 border-glass-subtle",
                    "shadow-glass-inset",
                    "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                  ]
            )}
          >
            Лучшие
          </button>
          <button
            onClick={() => setShowWorst(true)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium whitespace-nowrap",
              "backdrop-blur-xl border transition-all duration-200 rounded-xl",
              showWorst
                ? [
                    "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                    "text-white border-glass-strong",
                    "shadow-glass-inset",
                  ]
                : [
                    "bg-white/[0.06] text-white/60 border-glass-subtle",
                    "shadow-glass-inset",
                    "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                  ]
            )}
          >
            Худшие
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {visibleItems.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3">
            <span className="text-xs text-white/40 w-4 text-right font-medium">{i + 1}</span>
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 shrink-0">
              {item.product_photo_url || item.image_url ? (
                <Image
                  src={(item.product_photo_url || item.image_url)!}
                  alt=""
                  width={32}
                  height={32}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                  📦
                </div>
              )}
            </div>
            <p className="text-sm text-white/80 flex-1 min-w-0 line-clamp-1">{item.title}</p>
            <div className="flex items-center gap-2 text-xs text-white/60 shrink-0">
              <span>👁 {((item.views ?? 0) + (item.views_today ?? 0)).toLocaleString("ru")}</span>
              <span>
                ❤️ {((item.favorites ?? 0) + (item.favorites_today ?? 0)).toLocaleString("ru")}
              </span>
              <span>
                📝 {((item.contacts ?? 0) + (item.contacts_today ?? 0)).toLocaleString("ru")}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Кнопка «Все» — разворачивает полный рейтинг (универсально по числу товаров) */}
      {sortedItems.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className={cn(
            "mt-3 w-full py-2 text-xs font-medium rounded-xl transition-all duration-200",
            "bg-white/[0.06] text-white/70 border border-glass-subtle shadow-glass-inset",
            "hover:text-white hover:bg-white/[0.10] hover:border-white/20"
          )}
        >
          {showAll ? "Свернуть" : `Все (${sortedItems.length})`}
        </button>
      )}
    </div>
  );
}

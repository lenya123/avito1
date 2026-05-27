"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAvitoItems } from "@/hooks/use-avito";
import { AvitoItemCard } from "@/components/client/avito/item-card";
import { LinkProductModal } from "@/components/client/avito/link-product-modal";
import { PriceEditModal } from "@/components/client/avito/price-edit-modal";
import { Empty, ErrorState } from "@/components/ui/empty";
import { cn } from "@/utils/cn";

type Tab = "active" | "inactive";

export function DashboardItems() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("active");

  // Параллельно держим оба запроса, чтобы показать count в табах
  const active = useAvitoItems(1, 6, "active");
  const inactive = useAvitoItems(1, 6, "inactive");

  const current = tab === "active" ? active : inactive;
  const { data: itemsData, isLoading, isError, refetch } = current;

  const [linkingItemId, setLinkingItemId] = useState<number | null>(null);
  const [priceEditItem, setPriceEditItem] = useState<{
    id: number;
    price: number | null;
    title?: string;
  } | null>(null);

  const linkingItem = linkingItemId
    ? itemsData?.items.find((i) => i.avito_item_id === linkingItemId)
    : null;

  if (isError) {
    return (
      <ErrorState title="Ошибка" message="Не удалось загрузить объявления" onRetry={refetch} />
    );
  }

  const activeCount = active.data?.pagination?.total ?? 0;
  const inactiveCount = inactive.data?.pagination?.total ?? 0;

  const tabBtn = (key: Tab, label: string, count: number) => (
    <button
      onClick={() => setTab(key)}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded-xl border transition-all duration-200 flex items-center gap-1.5",
        tab === key
          ? "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08] text-white border-glass-strong"
          : "bg-white/[0.06] text-white/60 border-glass-subtle hover:text-white hover:bg-white/[0.10]"
      )}
    >
      {label}
      <span className={cn(
        "text-2xs px-1.5 py-0.5 rounded-md",
        tab === key ? "bg-white/15 text-white" : "bg-white/[0.08] text-white/50"
      )}>{count}</span>
    </button>
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Объявления</h2>
        {itemsData && itemsData.items.length > 0 && (
          <button
            onClick={() => router.push("/avito/items")}
            className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            Все →
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        {tabBtn("active", "Активные", activeCount)}
        {tabBtn("inactive", "Нуждаются в активации", inactiveCount)}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white/[0.04] border border-glass-minimal animate-pulse aspect-[3/4]"
            />
          ))}
        </div>
      ) : itemsData && itemsData.items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {itemsData.items.map((item) => (
            <AvitoItemCard
              key={item.id}
              title={item.title}
              price={item.price}
              status={item.status}
              url={item.url}
              imageUrl={item.image_url}
              views={item.views ?? 0}
              favorites={item.favorites ?? 0}
              contacts={item.contacts ?? 0}
              viewsToday={item.views_today ?? 0}
              favoritesToday={item.favorites_today ?? 0}
              contactsToday={item.contacts_today ?? 0}
              productPhotoUrl={item.product_photo_url}
              onLinkClick={() => setLinkingItemId(item.avito_item_id)}
              onPriceEditClick={() =>
                setPriceEditItem({
                  id: item.avito_item_id,
                  price: item.price,
                  title: item.title,
                })
              }
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={tab === "active" ? "📦" : "💤"}
          title={tab === "active" ? "Нет активных объявлений" : "Все объявления активны"}
          description={tab === "active"
            ? "После синхронизации сюда подтянутся активные товары с Avito"
            : "Снятые/неактивные объявления появятся здесь"}
        />
      )}

      <LinkProductModal
        isOpen={!!linkingItemId}
        onClose={() => setLinkingItemId(null)}
        avitoItemId={linkingItemId}
        avitoItemTitle={linkingItem?.title}
        currentProductId={linkingItem?.product_id}
        currentProductName={linkingItem?.product_name}
      />

      <PriceEditModal
        isOpen={!!priceEditItem}
        onClose={() => setPriceEditItem(null)}
        avitoItemId={priceEditItem?.id ?? null}
        currentPrice={priceEditItem?.price ?? null}
        itemTitle={priceEditItem?.title}
      />
    </section>
  );
}

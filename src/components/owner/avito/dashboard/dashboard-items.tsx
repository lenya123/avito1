"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAvitoItems } from "@/hooks/use-avito";
import { AvitoItemCard } from "@/components/owner/avito/item-card";
import { LinkProductModal } from "@/components/owner/avito/link-product-modal";
import { PriceEditModal } from "@/components/owner/avito/price-edit-modal";
import { CreateListingModal } from "@/components/owner/avito/create-listing-modal";
import { Empty, ErrorState } from "@/components/ui/empty";

export function DashboardItems() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Показываем все объявления (активные + ждущие действий)
  const { data: itemsData, isLoading, isError, refetch } = useAvitoItems(1, 50);

  const [linkingItemId, setLinkingItemId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [priceEditItem, setPriceEditItem] = useState<{
    id: number;
    price: number | null;
    title?: string;
  } | null>(null);

  // Заглушки управления — раскроются при интеграции в основную панель
  const handleToggle = (avitoItemId: number, currentStatus: string | null) => {
    alert(
      `Скоро: вкл/выкл объявления ${avitoItemId} (сейчас: ${currentStatus}).\nФункция будет доступна после интеграции в панель владельца.`
    );
  };

  const callItemAction = async (avitoItemId: number, mode: "stop" | "delete") => {
    try {
      const res = await fetch(`/api/avito/items/${avitoItemId}?mode=${mode}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || `Ошибка ${res.status}`);
        return;
      }
      // Полная инвалидация — обновятся items, overview-KPI, AI-агент, заказы.
      await queryClient.invalidateQueries({ queryKey: ["avito"] });
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStop = (avitoItemId: number) => {
    if (!confirm(`Снять объявление ${avitoItemId} с публикации?`)) return;
    callItemAction(avitoItemId, "stop");
  };
  const handleDelete = (avitoItemId: number) => {
    if (!confirm(`Удалить объявление ${avitoItemId} безвозвратно?`)) return;
    callItemAction(avitoItemId, "delete");
  };

  // Делим объявления на «Активные» (status=active) и «Снятые с публикации»
  // (status=old, Архив в Avito-кабинете — m.avito.ru/profile/items/old).
  // Остальные (inactive=«Ждут действий», sellervation) подтягиваются для
  // аналитики, но в этих разделах не показываются.
  const allItems = itemsData?.items ?? [];
  const activeItems = allItems.filter((i) => i.status === "active");
  const archivedItems = allItems.filter((i) => i.status === "old");

  const linkingItem = linkingItemId
    ? itemsData?.items.find((i) => i.avito_item_id === linkingItemId)
    : null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Объявления</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/owner/avito/library")}
            className="text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            Библиотека
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors font-medium"
          >
            + Создать
          </button>
          {itemsData && itemsData.items.length > 0 && (
            <button
              onClick={() => router.push("/owner/avito/items")}
              className="text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              Все →
            </button>
          )}
        </div>
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
      ) : isError ? (
        <ErrorState title="Ошибка" message="Не удалось загрузить объявления" onRetry={refetch} />
      ) : allItems.length > 0 ? (
        <div className="space-y-5">
          {activeItems.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-white/60 mb-2">
                Активные · {activeItems.length}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {activeItems.map((item) => (
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
                    isActive
                    onLinkClick={() => setLinkingItemId(item.avito_item_id)}
                    onPriceEditClick={() =>
                      setPriceEditItem({
                        id: item.avito_item_id,
                        price: item.price,
                        title: item.title,
                      })
                    }
                    onToggleClick={() => handleToggle(item.avito_item_id, item.status)}
                    onStopClick={() => handleStop(item.avito_item_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {archivedItems.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-white/60 mb-2">
                Снятые с публикации · {archivedItems.length}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {archivedItems.map((item) => (
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
                    isActive={false}
                    onLinkClick={() => setLinkingItemId(item.avito_item_id)}
                    onDeleteClick={() => handleDelete(item.avito_item_id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Empty
          icon="📦"
          title="Объявления появятся после синхронизации"
          description="Нажмите «Синхронизировать» вверху"
        />
      )}

      <CreateListingModal isOpen={showCreate} onClose={() => setShowCreate(false)} />

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

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/utils/cn";
import { BackButton, Spinner, Empty } from "@/components/ui";
import {
  useAvitoItems,
  useToggleItemActive,
  useDeleteItem,
} from "@/hooks/use-avito";
import { AvitoItemCard } from "@/components/client/avito/item-card";
import { LinkProductModal } from "@/components/client/avito/link-product-modal";
import { PriceEditModal } from "@/components/client/avito/price-edit-modal";

const PER_PAGE = 20;

export default function AvitoItemsPage() {
  const [page, setPage] = useState(1);
  const [linkingItemId, setLinkingItemId] = useState<number | null>(null);
  const [priceItemId, setPriceItemId] = useState<number | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const { data, isLoading } = useAvitoItems(page, PER_PAGE);
  const toggleActive = useToggleItemActive();
  const deleteItem = useDeleteItem();

  const linkingItem = linkingItemId
    ? data?.items.find((i) => i.avito_item_id === linkingItemId)
    : null;
  const priceItem = priceItemId
    ? data?.items.find((i) => i.avito_item_id === priceItemId)
    : null;

  const handleToggle = async (itemId: number, isActive: boolean) => {
    setBusyItemId(itemId);
    try {
      await toggleActive.mutateAsync({ itemId, active: !isActive });
      toast.success(
        isActive ? "Снятие с публикации поставлено в очередь" : "Публикация поставлена в очередь"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyItemId(null);
    }
  };

  const handleDelete = async (itemId: number, title: string) => {
    if (!window.confirm(`Удалить объявление «${title}»? Действие необратимо.`)) return;
    setBusyItemId(itemId);
    try {
      await deleteItem.mutateAsync({ itemId });
      toast.success("Удаление поставлено в очередь");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyItemId(null);
    }
  };

  const totalPages = data?.pagination.totalPages ?? 1;

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/avito" />
        <div>
          <h1 className="text-xl font-bold text-white">Объявления</h1>
          {data && <p className="text-sm text-white/40 mt-0.5">Всего: {data.pagination.total}</p>}
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <AvitoItemCard
                  title={item.title}
                  price={item.price}
                  status={item.status}
                  url={item.url}
                  imageUrl={item.image_url}
                  views={item.views ?? 0}
                  favorites={item.favorites ?? 0}
                  contacts={item.contacts ?? 0}
                  orders={item.orders_count ?? 0}
                  viewsToday={item.views_today ?? 0}
                  favoritesToday={item.favorites_today ?? 0}
                  contactsToday={item.contacts_today ?? 0}
                  ordersToday={item.orders_today ?? 0}
                  productPhotoUrl={item.product_photo_url}
                  busy={busyItemId === item.avito_item_id}
                  onLinkClick={() => setLinkingItemId(item.avito_item_id)}
                  onPriceEditClick={() => setPriceItemId(item.avito_item_id)}
                  onToggleActive={() =>
                    handleToggle(item.avito_item_id, item.status === "active")
                  }
                  onDelete={() => handleDelete(item.avito_item_id, item.title)}
                />
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className={cn(
                "flex items-center justify-center gap-3 mt-6 p-3 rounded-xl",
                "bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
                "border border-glass-subtle"
              )}
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={cn(
                  "p-2 rounded-xl transition-all duration-200",
                  "bg-gradient-to-b from-white/[0.1] to-white/[0.05]",
                  "border border-glass-subtle",
                  "hover:border-glass disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <span className="text-sm text-white/60 px-2 font-medium">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={cn(
                  "p-2 rounded-xl transition-all duration-200",
                  "bg-gradient-to-b from-white/[0.1] to-white/[0.05]",
                  "border border-glass-subtle",
                  "hover:border-glass disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty
          icon="📦"
          title="Нет объявлений"
          description="Синхронизируйте данные на главной странице Avito"
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
        isOpen={!!priceItemId}
        onClose={() => setPriceItemId(null)}
        avitoItemId={priceItemId}
        currentPrice={priceItem?.price ?? null}
        itemTitle={priceItem?.title}
      />
    </main>
  );
}

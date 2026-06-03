"use client";

import { useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import { useAvitoProducts, useLinkAvitoItem, useUnlinkAvitoItem } from "@/hooks/use-avito";

interface LinkProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  avitoItemId: number | null;
  avitoItemTitle?: string;
  currentProductId?: string | null;
  currentProductName?: string | null;
}

export function LinkProductModal({
  isOpen,
  onClose,
  avitoItemId,
  avitoItemTitle,
  currentProductId,
  currentProductName,
}: LinkProductModalProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useAvitoProducts(search, isOpen);
  const linkMutation = useLinkAvitoItem();
  const unlinkMutation = useUnlinkAvitoItem();

  const products = data?.products || [];

  const handleLink = (productId: string) => {
    if (!avitoItemId) return;
    linkMutation.mutate(
      { avitoItemId, productId },
      {
        onSuccess: () => {
          setSearch("");
          onClose();
        },
      }
    );
  };

  const handleUnlink = () => {
    if (!avitoItemId) return;
    unlinkMutation.mutate(avitoItemId, {
      onSuccess: () => {
        setSearch("");
        onClose();
      },
    });
  };

  const handleClose = () => {
    setSearch("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Привязать к товару" size="md">
      {avitoItemTitle && (
        <p className="text-xs text-white/40 -mt-2 mb-4 truncate">{avitoItemTitle}</p>
      )}

      {/* Current link */}
      {currentProductId && currentProductName && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 p-3 mb-4 rounded-xl",
            "bg-accent-green/10 border border-accent-green/20"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-accent-green flex-shrink-0"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-white truncate">{currentProductName}</span>
          </div>
          <button
            onClick={handleUnlink}
            disabled={unlinkMutation.isPending}
            className="text-xs text-white/60 hover:text-white/80 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            Отвязать
          </button>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по названию..."
        className={cn(
          "w-full rounded-xl px-3 py-2.5 text-sm mb-3",
          "bg-white/[0.06] text-white placeholder-white/30",
          "border border-glass-minimal focus:border-accent-blue/50",
          "outline-none transition-colors"
        )}
      />

      {/* Product list */}
      <div className="max-h-72 overflow-y-auto -mx-1 px-1">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : products.length === 0 ? (
          <p className="text-xs text-white/20 text-center py-8">
            {search ? "Ничего не найдено" : "Нет товаров"}
          </p>
        ) : (
          <div className="space-y-1">
            {products.map((product) => {
              const mainIdx = product.photo_main_index ?? 0;
              const photoUrl = product.photo_urls?.[mainIdx] || product.photo_urls?.[0];
              const isCurrentLink = product.id === currentProductId;

              return (
                <button
                  key={product.id}
                  onClick={() => handleLink(product.id)}
                  disabled={linkMutation.isPending || isCurrentLink}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded-xl text-left",
                    "transition-colors duration-150",
                    isCurrentLink
                      ? "bg-accent-green/10 border border-accent-green/20"
                      : "hover:bg-white/[0.06] border border-transparent",
                    "disabled:opacity-50"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 overflow-hidden flex-shrink-0 relative">
                    {photoUrl ? (
                      <Image
                        src={photoUrl}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">
                        📦
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{product.name}</p>
                    <p className="text-xs text-white/40">
                      {product.drop_price.toLocaleString("ru")} ₽
                    </p>
                  </div>
                  {isCurrentLink && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      className="text-accent-green flex-shrink-0"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

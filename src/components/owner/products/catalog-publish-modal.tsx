"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button, Modal } from "@/components/ui";
import { cn } from "@/utils/cn";
import { sortSizes } from "@/utils/sizes";

export interface CatalogPublishProduct {
  id: string;
  name: string;
  dropPrice: number;
  recommendedPrice: number | null;
  description: string | null;
  photoUrls: string[];
  sizes: Array<{ size: string; currentQuantity: number }>;
}

export interface CatalogPublishModalProps {
  product: CatalogPublishProduct | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function buildDefaultCaption(product: CatalogPublishProduct): string {
  const sizesAvailable = product.sizes.filter((s) => s.currentQuantity > 0).map((s) => s.size);
  const sortedSizes = sortSizes(Array.from(new Set(sizesAvailable)));
  const sizesLine = sortedSizes.length > 0 ? sortedSizes.join(" · ") : null;

  const catalogBase = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/catalog`
    : "/catalog";

  const lines = [`<b>${product.name}</b>`, "", `💰 Дроп: <b>${formatRub(product.dropPrice)}</b>`];

  if (product.recommendedPrice && product.recommendedPrice > 0) {
    lines.push(`🔖 Авито: ${formatRub(product.recommendedPrice)}`);
  }

  if (sizesLine) {
    lines.push("", `📏 Размеры: ${sizesLine}`);
  }

  if (product.description && product.description.trim()) {
    lines.push("", product.description.trim());
  }

  lines.push("", `🔗 Полный каталог: ${catalogBase}`);

  return lines.join("\n");
}

export function CatalogPublishModal({ product, isOpen, onClose }: CatalogPublishModalProps) {
  const allPhotos = useMemo(() => product?.photoUrls ?? [], [product]);

  const [order, setOrder] = useState<number[]>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !product) return;
    setOrder(allPhotos.map((_, i) => i));
    setIncluded(new Set(allPhotos.map((_, i) => i)));
    setCaption(buildDefaultCaption(product));
    setError(null);
    setSuccess(null);
  }, [isOpen, product, allPhotos]);

  const move = (idx: number, dir: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const toggle = (i: number) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const includedOrdered = order.filter((i) => included.has(i));

  const handleSubmit = async () => {
    if (!product) return;
    if (!caption.trim()) {
      setError("Заполни текст поста");
      return;
    }
    if (caption.length > 1024) {
      setError("Текст слишком длинный (макс 1024 символа)");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/owner/products/${product.id}/publish-to-catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, photoIndices: includedOrdered }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        photoCount?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Не удалось опубликовать");
        return;
      }
      setSuccess(`✅ Опубликовано (${data.photoCount ?? 0} фото).`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error("[catalog-publish-modal] submit failed:", err);
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Публикация в канал каталога"
      description="Customer-bot опубликует пост в Telegram-канал, который указан в business_settings.catalog_channel_id. Бот должен быть админом канала."
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 text-sm font-medium text-gray-700">
            Фото ({includedOrdered.length} из {allPhotos.length})
          </div>
          {allPhotos.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
              У товара нет фото — будет опубликован только текст.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {order.map((photoIdx, position) => {
                const url = allPhotos[photoIdx];
                if (!url) return null;
                const inc = included.has(photoIdx);
                const includedPosition = includedOrdered.indexOf(photoIdx);
                return (
                  <div
                    key={photoIdx}
                    className={cn(
                      "relative overflow-hidden rounded-lg border-2 transition",
                      inc ? "border-emerald-400" : "border-gray-200 opacity-50"
                    )}
                  >
                    <div className="relative aspect-square bg-gray-100">
                      <Image
                        src={url}
                        alt={`Фото ${photoIdx + 1}`}
                        fill
                        sizes="200px"
                        className="object-cover"
                      />
                      {inc && includedPosition >= 0 && (
                        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                          {includedPosition + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 bg-white p-1.5">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={inc}
                          onChange={() => toggle(photoIdx)}
                          className="h-4 w-4"
                        />
                        Включить
                      </label>
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => move(position, -1)}
                          disabled={position === 0}
                          className="rounded px-1.5 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-30"
                          aria-label="Выше"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(position, 1)}
                          disabled={position === order.length - 1}
                          className="rounded px-1.5 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-30"
                          aria-label="Ниже"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {includedOrdered.length > 10 && (
            <div className="mt-2 text-xs text-amber-600">
              Telegram принимает максимум 10 фото в посте — лишние ({includedOrdered.length - 10})
              будут обрезаны.
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="catalog-caption" className="text-sm font-medium text-gray-700">
              Текст поста
            </label>
            <span
              className={cn("text-xs", caption.length > 1024 ? "text-red-600" : "text-gray-400")}
            >
              {caption.length} / 1024
            </span>
          </div>
          <textarea
            id="catalog-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-gray-300 p-3 font-mono text-xs leading-relaxed focus:border-gray-500 focus:outline-none"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-gray-500">
            HTML-теги работают: <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>,
            <code>&lt;a href=&quot;…&quot;&gt;</code>, <code>&lt;code&gt;</code>.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Публикую…" : "Опубликовать"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

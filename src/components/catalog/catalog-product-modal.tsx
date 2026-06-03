"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Button, Modal, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import { sortSizeEntries } from "@/utils/sizes";
import type { CatalogProduct } from "./types";

export interface CatalogProductModalProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const MEASUREMENT_LABELS: Record<string, string> = {
  chest: "Грудь",
  length: "Длина",
  shoulders: "Плечи",
  waist: "Талия",
  hips: "Бёдра",
  sleeve: "Рукав",
  inseam: "Внутр. шов",
};

function measurementLabel(key: string): string {
  return MEASUREMENT_LABELS[key] ?? key;
}

function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function formatArrival(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function safeFilename(name: string): string {
  return (
    name
      .replace(/[^a-zA-Zа-яА-Я0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 50) || "photos"
  );
}

export function CatalogProductModal({ productId, isOpen, onClose }: CatalogProductModalProps) {
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeImage, setActiveImage] = useState(0);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen || !productId) {
      setProduct(null);
      setError(null);
      setActiveImage(0);
      setShowMeasurements(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/catalog/${productId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((data: CatalogProduct) => {
        if (cancelled) return;
        setProduct(data);
        setActiveImage(data.photo_main_index ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[catalog modal] fetch error:", err);
        setError("Не удалось загрузить товар");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, productId]);

  const sortedSizes = useMemo(() => {
    if (!product) return [];
    return sortSizeEntries(product.sizes);
  }, [product]);

  const measurementColumns = useMemo(() => {
    if (!product) return [] as string[];
    const keys = new Set<string>();
    product.sizes.forEach((s) => {
      if (s.measurements) {
        Object.keys(s.measurements).forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [product]);

  const photos = product?.photo_urls ?? [];

  const handleSwipeEnd = (_: unknown, info: PanInfo) => {
    if (photos.length < 2) return;
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    if (offset < -50 || velocity < -300) {
      setActiveImage((prev) => Math.min(prev + 1, photos.length - 1));
    } else if (offset > 50 || velocity > 300) {
      setActiveImage((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleDownloadZip = async () => {
    if (!product || photos.length === 0 || downloading) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("photos");

      await Promise.all(
        photos.map(async (url, index) => {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const blob = await res.blob();
            const ext = (url.split(".").pop() ?? "jpg").split("?")[0].toLowerCase();
            const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
            folder?.file(`${index + 1}.${safeExt}`, blob);
          } catch (err) {
            console.error(`[catalog modal] photo ${index + 1} download failed:`, err);
          }
        })
      );

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${safeFilename(product.name)}.zip`);
    } catch (err) {
      console.error("[catalog modal] zip generation failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const totalAvailable = product?.sizes.reduce((acc, s) => acc + s.available, 0) ?? 0;
  const isInTransit = product ? !product.is_in_stock : false;
  const isSoldOut = product ? product.is_in_stock && totalAvailable === 0 : false;
  const isAvailable = product ? product.is_in_stock && totalAvailable > 0 : false;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton className="overflow-y-auto">
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      )}

      {error && !loading && <div className="py-12 text-center text-sm text-red-600">{error}</div>}

      {product && !loading && (
        <div className="flex flex-col gap-5">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-100">
            {photos.length > 0 ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeImage}
                  drag={photos.length > 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.15}
                  onDragEnd={handleSwipeEnd}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="relative h-full w-full"
                >
                  <Image
                    src={photos[activeImage]}
                    alt={`${product.name} ${activeImage + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 700px"
                    className="select-none object-cover"
                    draggable={false}
                  />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl text-gray-300">
                🖼
              </div>
            )}

            {photos.length > 1 && (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Фото ${i + 1}`}
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === activeImage ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80"
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {photos.length > 1 && (
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {photos.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg border-2 transition",
                    i === activeImage
                      ? "border-gray-900"
                      : "border-transparent hover:border-gray-300"
                  )}
                >
                  <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {isAvailable && (
                <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-800">
                  В наличии
                </span>
              )}
              {isInTransit && (
                <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
                  В пути
                  {product.expected_arrival_date
                    ? ` · ${formatArrival(product.expected_arrival_date)}`
                    : ""}
                </span>
              )}
              {isSoldOut && (
                <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
                  Продано
                </span>
              )}
              {product.category && <span className="text-gray-500">{product.category}</span>}
            </div>
          </div>

          <div className="flex items-baseline gap-4 border-y border-gray-100 py-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">Дроп</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatRub(product.drop_price)}
              </div>
            </div>
            {product.recommended_price !== null && product.recommended_price > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">Авито</div>
                <div className="text-xl font-semibold text-gray-700">
                  {formatRub(product.recommended_price)}
                </div>
              </div>
            )}
          </div>

          {sortedSizes.length > 0 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Размеры</div>
              <div className="flex flex-wrap gap-2">
                {sortedSizes.map((s) => (
                  <span
                    key={s.id}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium",
                      s.available > 0
                        ? "bg-gray-100 text-gray-900"
                        : "bg-gray-50 text-gray-400 line-through"
                    )}
                  >
                    {s.size}
                    {s.available > 0 && (
                      <span className="ml-1 text-xs text-gray-500">· {s.available}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {product.description && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">Описание</div>
              <p className="whitespace-pre-line text-sm text-gray-700">{product.description}</p>
            </div>
          )}

          {measurementColumns.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowMeasurements((v) => !v)}
                className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
              >
                {showMeasurements ? "Скрыть замеры" : "Показать замеры"}
              </button>

              <AnimatePresence>
                {showMeasurements && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              Размер
                            </th>
                            {measurementColumns.map((k) => (
                              <th key={k} className="px-3 py-2 text-left font-medium text-gray-600">
                                {measurementLabel(k)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSizes.map((s) => (
                            <tr key={s.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-medium text-gray-900">{s.size}</td>
                              {measurementColumns.map((k) => (
                                <td key={k} className="px-3 py-2 text-gray-700">
                                  {s.measurements?.[k] !== undefined
                                    ? `${s.measurements[k]} см`
                                    : "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant="primary"
              onClick={handleDownloadZip}
              disabled={downloading || photos.length === 0}
            >
              {downloading ? "Готовлю архив…" : `📥 Скачать фото (${photos.length})`}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

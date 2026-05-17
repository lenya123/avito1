"use client";

import { useState, useMemo, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { cn } from "@/utils/cn";
import { Button, Modal, Spinner } from "@/components/ui";
import { calculatePriceBreakdown, formatPrice } from "@/utils/pricing";
import { sizeOrder } from "@/utils/sizes";
import type { ProductData } from "./product-card";

interface SizeWithAvailability {
  id: string;
  size: string;
  available: number;
  isAvailable: boolean;
}

interface ProductWithDetails extends ProductData {
  isNotificationEnabled?: boolean;
  sizesWithAvailability?: SizeWithAvailability[];
}

export interface ProductModalProps {
  product: ProductWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onFavoriteToggle?: (productId: string, isFavorite: boolean) => void;
  onNotifyToggle?: (productId: string) => void;
  onOrder?: (productId: string) => void;
  userLevel?: number;
  isFirstOrder?: boolean;
  isLoading?: boolean;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

const measurementLabels: Record<string, string> = {
  chest: "Грудь",
  length: "Длина",
  shoulders: "Плечи",
  waist: "Талия",
  hips: "Бёдра",
  sleeve: "Рукав",
  inseam: "Внутр. шов",
};

function getMeasurementLabel(key: string): string {
  return measurementLabels[key] || key;
}

export function ProductModal({
  product,
  isOpen,
  onClose,
  onFavoriteToggle,
  onNotifyToggle,
  onOrder,
  userLevel = 0,
  isFirstOrder = false,
  isLoading = false,
}: ProductModalProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(product?.isFavorite || false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Расчёт цены с учётом уровня и скидки первого заказа
  const levelDiscounts = [0, 3, 6, 10];
  const discountPercent = levelDiscounts[userLevel] || 0;

  const pricing = useMemo(() => {
    if (!product) return null;
    return calculatePriceBreakdown({
      dropPrice: product.drop_price,
      discountPercent,
      isFirstOrder,
    });
  }, [product, discountPercent, isFirstOrder]);

  // Сортировка размеров
  const sortedSizes = useMemo(() => {
    if (!product?.sizesWithAvailability) return [];
    return [...product.sizesWithAvailability].sort((a, b) => {
      const indexA = sizeOrder.indexOf(a.size);
      const indexB = sizeOrder.indexOf(b.size);
      if (indexA === -1 && indexB === -1) return a.size.localeCompare(b.size);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [product?.sizesWithAvailability]);

  // Проверяем доступность: сначала из sizesWithAvailability (детальные данные),
  // если нет — из availableSizes (данные из списка)
  // ВАЖНО: этот хук должен быть до раннего return
  const hasAvailableSizes = useMemo(() => {
    if (sortedSizes.length > 0) {
      return sortedSizes.some((s) => s.isAvailable);
    }
    // Fallback на данные из списка
    return (product?.availableSizes?.length || 0) > 0;
  }, [sortedSizes, product?.availableSizes]);

  // Ранний return ПОСЛЕ всех хуков
  if (!product || !pricing) return null;

  const photos = product.photo_urls || [];
  const measurements = product.measurements as Record<string, Record<string, number>> | null;
  const originalPrice = pricing.basePrice;
  const discountedPrice = pricing.finalPrice;

  const handleFavoriteClick = async () => {
    const newState = !isFavorite;
    setIsFavorite(newState);
    await onFavoriteToggle?.(product.id, newState);
  };

  // Навигация по фото
  const goToPhoto = (index: number) => {
    if (index < 0 || index >= photos.length || index === activeImageIndex) return;
    setActiveImageIndex(index);
  };

  // Обработка свайпа — iOS style
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setIsDragging(false);
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const swipeThreshold = 50;
    const velocityThreshold = 300;

    // Свайп влево (следующее фото)
    if (offset < -swipeThreshold || velocity < -velocityThreshold) {
      setActiveImageIndex((prev) => Math.min(prev + 1, photos.length - 1));
    }
    // Свайп вправо (предыдущее фото)
    else if (offset > swipeThreshold || velocity > velocityThreshold) {
      setActiveImageIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  // Скачивание всех фото в ZIP
  const handleDownloadPhotos = async () => {
    if (photos.length === 0 || isDownloading) return;

    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("photos");

      // Скачиваем все фото параллельно
      const downloadPromises = photos.map(async (url, index) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();

          // Определяем расширение из URL или используем jpg по умолчанию
          const urlParts = url.split(".");
          const ext = urlParts[urlParts.length - 1].split("?")[0].toLowerCase();
          const extension = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";

          folder?.file(`${index + 1}.${extension}`, blob);
        } catch (err) {
          console.error(`Failed to download photo ${index + 1}:`, err);
        }
      });

      await Promise.all(downloadPromises);

      // Генерируем ZIP
      const content = await zip.generateAsync({ type: "blob" });

      // Формируем имя файла из названия товара
      const safeName = (product.name || "photos")
        .replace(/[^a-zA-Zа-яА-Я0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 50);

      saveAs(content, `${safeName}.zip`);
    } catch (err) {
      console.error("Failed to create ZIP:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Определяем статус товара
  // is_in_stock = false → "В пути" (ждём поставку)
  // is_in_stock = true + нет доступных размеров → "Продано" (раскупили)
  // is_in_stock = true + есть доступные размеры → "В наличии"
  const isSoldOut = product.is_in_stock && !hasAvailableSizes;
  const isInTransit = !product.is_in_stock;
  const isAvailable = product.is_in_stock && hasAvailableSizes;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      showCloseButton={false}
      className="overflow-y-auto [-webkit-overflow-scrolling:touch]"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Image gallery - Glass container */}
          <div className="relative mb-5">
            {/* Main image container with glass effect */}
            <div
              ref={containerRef}
              className={cn(
                "relative rounded-2xl overflow-hidden",
                "bg-gradient-to-b from-white/[0.10] to-white/[0.04]",
                "border border-glass-active",
                "shadow-card"
              )}
            >
              <div className="relative aspect-[4/4] overflow-hidden">
                {/* iOS-style carousel track */}
                <motion.div
                  className="flex h-full"
                  style={{
                    width: `${photos.length * 100}%`,
                  }}
                  animate={{
                    x: `${-activeImageIndex * (100 / photos.length)}%`,
                  }}
                  transition={
                    isDragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }
                  }
                  drag={photos.length > 1 ? "x" : false}
                  dragConstraints={containerRef}
                  dragElastic={0.1}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  {photos.length > 0 ? (
                    photos.map((photo, index) => (
                      <div
                        key={index}
                        className="relative h-full p-4 flex-shrink-0"
                        style={{ width: `${100 / photos.length}%` }}
                      >
                        <div className="relative w-full h-full rounded-xl overflow-hidden bg-white/[0.02]">
                          <Image
                            src={photo}
                            alt={index === activeImageIndex ? product.name : ""}
                            fill
                            className="object-contain pointer-events-none"
                            sizes="(max-width: 768px) 100vw, 600px"
                            draggable={false}
                            priority={Math.abs(index - activeImageIndex) <= 1}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center w-full h-full text-white/20">
                      <svg
                        className="w-20 h-20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Favorite button */}
              <button
                onClick={handleFavoriteClick}
                className={cn(
                  "absolute top-6 right-6",
                  "w-10 h-10 flex items-center justify-center",
                  "rounded-full",
                  "bg-gradient-to-b from-white/[0.22] to-white/[0.14]",
                  "backdrop-blur-md",
                  "border border-glass-glow",
                  "shadow-card",
                  "transition-all duration-200",
                  "hover:from-white/[0.28] hover:to-white/[0.18] hover:border-white/60 hover:scale-105",
                  "active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-full"
                )}
              >
                <svg
                  className={cn(
                    "w-5 h-5 transition-all duration-200",
                    isFavorite ? "fill-accent-red text-accent-red" : "fill-none text-white"
                  )}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </button>

              {/* Top left controls - Photo counter + Download button */}
              <div className="absolute top-6 left-6 flex items-center gap-2">
                {/* Photo counter */}
                {photos.length > 1 && (
                  <div
                    className={cn(
                      "h-10 px-3.5 rounded-full",
                      "flex items-center justify-center",
                      "bg-gradient-to-b from-white/[0.22] to-white/[0.14]",
                      "backdrop-blur-md",
                      "border border-white/50",
                      "text-xs font-medium text-white",
                      "shadow-card"
                    )}
                  >
                    {activeImageIndex + 1} / {photos.length}
                  </div>
                )}

                {/* Download button */}
                {photos.length > 0 && (
                  <button
                    onClick={handleDownloadPhotos}
                    disabled={isDownloading}
                    className={cn(
                      "w-10 h-10 flex items-center justify-center",
                      "rounded-full",
                      "bg-gradient-to-b from-white/[0.22] to-white/[0.14]",
                      "backdrop-blur-md",
                      "border border-glass-glow",
                      "shadow-card",
                      "transition-all duration-200",
                      "hover:from-white/[0.28] hover:to-white/[0.18] hover:border-white/60 hover:scale-105",
                      "active:scale-95",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-full",
                      isDownloading && "opacity-60 cursor-not-allowed"
                    )}
                    aria-label="Скачать все фото"
                  >
                    {isDownloading ? (
                      <svg
                        className="w-5 h-5 text-white animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Thumbnails - Below main image */}
            {photos.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide px-1">
                {photos.map((photo, index) => (
                  <button
                    key={index}
                    onClick={() => goToPhoto(index)}
                    className={cn(
                      "relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0",
                      "border-2 transition-all duration-200",
                      "bg-white/[0.06]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                      activeImageIndex === index
                        ? "border-accent-blue shadow-[0_0_12px_rgba(10,132,255,0.4),inset_0_0_0_1px_rgba(10,132,255,0.2)]"
                        : "border-glass hover:border-white/35 shadow-card"
                    )}
                  >
                    <Image
                      src={photo}
                      alt={`Фото товара ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="space-y-4">
            {/* Title & Brand */}
            <div>
              {product.brand && (
                <p className="text-xs text-white/60 uppercase tracking-widest font-medium mb-1.5">
                  {product.brand}
                </p>
              )}
              <h2 className="text-xl font-semibold text-white leading-tight">{product.name}</h2>

              {/* Status row - Premium/Standard + Stock status */}
              <div className="flex items-center gap-2 mt-2.5">
                {/* Premium or Standard badge - GLASS style for modal context */}
                <div
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-full",
                    "bg-white/[0.12]",
                    "border border-glass",
                    product.is_premium
                      ? "shadow-[0_2px_8px_rgba(0,0,0,0.2),0_0_10px_rgba(255,159,10,0.1),inset_0_1px_0_rgba(255,255,255,0.15)]"
                      : "shadow-card"
                  )}
                >
                  <span
                    className={cn(
                      "text-2xs font-semibold uppercase tracking-wide",
                      product.is_premium ? "text-accent-orange" : "text-white/80"
                    )}
                  >
                    {product.is_premium ? "PREMIUM" : "STANDARD"}
                  </span>
                </div>

                {/* Stock status - synced with ProductCard */}
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isAvailable &&
                        "bg-accent-green shadow-[0_0_3px_0_rgb(var(--accent-green))] animate-pulse",
                      isInTransit &&
                        "bg-accent-orange shadow-[0_0_3px_0_rgb(var(--accent-orange))] animate-pulse",
                      isSoldOut && "bg-accent-red shadow-[0_0_3px_0_rgb(var(--accent-red))]"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isAvailable && "text-accent-green",
                      isInTransit && "text-accent-orange",
                      isSoldOut && "text-accent-red"
                    )}
                  >
                    {isAvailable && "В наличии"}
                    {isInTransit && "В пути"}
                    {isSoldOut && "Продано"}
                  </span>
                </div>

                {/* Arrival date */}
                {isInTransit && product.expected_arrival_date && (
                  <span className="text-xs text-white/40">
                    {formatDate(product.expected_arrival_date)}
                  </span>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-2xl font-bold text-white">
                {formatPrice(Math.round(discountedPrice))}
              </span>
              {pricing.totalDiscount > 0 && (
                <>
                  <span className="text-base text-white/40 line-through">
                    {formatPrice(originalPrice)}
                  </span>
                  {pricing.levelDiscountPercent > 0 && (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-xs font-semibold",
                        "bg-white/[0.14] text-white",
                        "border border-glass-strong",
                        "shadow-glass-inset"
                      )}
                    >
                      −{pricing.levelDiscountPercent}%
                    </span>
                  )}
                  {pricing.firstOrderDiscount > 0 && (
                    <span className="text-sm font-semibold text-accent-orange">−500 ₽</span>
                  )}
                </>
              )}
            </div>

            {/* Sizes - Glass style */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white/80">Размеры</h3>
                {measurements && (
                  <button
                    onClick={() => setShowMeasurements(!showMeasurements)}
                    className={cn(
                      "text-sm text-white/60",
                      "hover:text-white/80 transition-colors",
                      "flex items-center gap-1.5",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl"
                    )}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    {showMeasurements ? "Скрыть замеры" : "Показать замеры"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {sortedSizes.length > 0 ? (
                  sortedSizes.map((size) => (
                    <div
                      key={size.id}
                      className={cn(
                        "min-w-[52px] px-3 py-2 rounded-xl text-center",
                        "border transition-all duration-200",
                        size.isAvailable
                          ? ["bg-white/[0.10]", "border border-glass", "shadow-card"]
                          : ["bg-transparent", "border-white/[0.08]"]
                      )}
                    >
                      <span
                        className={cn(
                          "block font-semibold text-sm",
                          size.isAvailable ? "text-white" : "text-white/40"
                        )}
                      >
                        {size.size}
                      </span>
                      {size.isAvailable && (
                        <span className="block text-2xs text-white/60 mt-0.5">
                          {size.available} шт
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div
                    className={cn(
                      "min-w-[52px] px-3 py-2 rounded-xl text-center",
                      "border transition-all duration-200",
                      "bg-white/[0.10] border-glass shadow-card"
                    )}
                  >
                    <span className="block font-semibold text-sm text-white">One Size</span>
                  </div>
                )}
              </div>
            </div>

            {/* Measurements table */}
            <AnimatePresence>
              {showMeasurements && measurements && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      "rounded-xl p-4 overflow-x-auto",
                      "bg-gradient-to-b from-white/[0.06] to-white/[0.03]",
                      "border border-glass",
                      "shadow-glass-inset"
                    )}
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-white/60">
                          <th className="text-left py-2 pr-4 font-medium">Размер</th>
                          {Object.keys(measurements[Object.keys(measurements)[0]] || {}).map(
                            (key) => (
                              <th key={key} className="text-center py-2 px-2 font-medium">
                                {getMeasurementLabel(key)}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(measurements)
                          .sort(([a], [b]) => {
                            const indexA = sizeOrder.indexOf(a);
                            const indexB = sizeOrder.indexOf(b);
                            // Если размер не в списке - в конец
                            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                          })
                          .map(([size, values]) => (
                            <tr key={size} className="border-t border-glass-minimal">
                              <td className="py-2.5 pr-4 font-semibold text-white">{size}</td>
                              {Object.values(values).map((value, i) => (
                                <td key={i} className="text-center py-2.5 px-2 text-white/80">
                                  {value} см
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

            {/* Description */}
            {product.description && (
              <div>
                <h3 className="text-sm font-semibold text-white/80 mb-2">Описание</h3>
                <p className="text-sm text-white/80 whitespace-pre-line leading-relaxed">
                  {product.description}
                </p>
              </div>
            )}
          </div>

          {/* Footer with glass buttons */}
          <div className="flex items-center gap-3 mt-6 pt-5 border-t border-glass">
            <button
              onClick={onClose}
              className={cn(
                "flex-1 py-3 rounded-xl font-medium text-sm",
                "bg-gradient-to-b from-white/[0.14] to-white/[0.08]",
                "text-white/80",
                "border border-white/35",
                "shadow-card",
                "transition-all duration-200",
                "hover:from-white/[0.18] hover:to-white/[0.10] hover:text-white hover:border-white/45",
                "active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl"
              )}
            >
              Закрыть
            </button>
            {isAvailable ? (
              <Button
                variant="primary"
                onClick={() => onOrder?.(product.id)}
                className="flex-1 py-3 rounded-xl"
              >
                Заказать
              </Button>
            ) : (
              <Button
                variant={product.isNotificationEnabled ? "warning" : "secondary"}
                size="md"
                onClick={() => onNotifyToggle?.(product.id)}
                className="flex-1 py-3"
                leftIcon={
                  <svg
                    className={cn(
                      "w-4 h-4",
                      product.isNotificationEnabled ? "fill-white" : "fill-none"
                    )}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                }
              >
                {product.isNotificationEnabled ? "Уведомление включено" : "Уведомить"}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

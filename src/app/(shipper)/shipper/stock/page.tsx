"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Empty, Modal, ModalFooter, Input } from "@/components/ui";
import { cn } from "@/utils/cn";
import { StockCard, StockCardSkeleton } from "@/components/shipper/stock-card";
import {
  useShipperStock,
  useAdjustStock,
  useCreateProduct,
  useCreateManualOrder,
  useUploadProductPhoto,
  useDeleteProduct,
} from "@/hooks/use-shipper-stock";
import { sortSizeEntries } from "@/utils/sizes";
import type { StockProduct } from "@/hooks/use-shipper-stock";
import { Z_HEADER } from "@/components/shipper/constants";

type StockFilter = "all" | "in_stock" | "out_of_stock";

const FILTER_TABS: { value: StockFilter; label: string; color: string; glowColor: string }[] = [
  { value: "all", label: "Все", color: "text-white/70", glowColor: "rgba(255,255,255,0.15)" },
  {
    value: "in_stock",
    label: "В наличии",
    color: "text-accent-green",
    glowColor: "rgba(48,209,88,0.3)",
  },
  {
    value: "out_of_stock",
    label: "Нет в наличии",
    color: "text-accent-red",
    glowColor: "rgba(255,69,58,0.3)",
  },
];

const DELIVERY_SERVICES = [
  { value: "cdek", label: "СДЭК" },
  { value: "avito", label: "Авито" },
  { value: "yandex", label: "Яндекс" },
  { value: "pochta", label: "Почта" },
  { value: "5post", label: "5Post" },
] as const;

const numberInputCls = cn(
  "w-20 px-3 py-2.5 rounded-xl text-center",
  "bg-white/[0.08] backdrop-blur-sm",
  "border border-glass",
  "text-white",
  "focus:outline-none focus:border-white/30 focus:bg-white/[0.12]",
  "focus-visible:ring-2 focus-visible:ring-accent-blue"
);

const sizeTextInputCls = cn(
  "w-16 px-3 py-2.5 rounded-xl text-center uppercase",
  "bg-white/[0.08] border border-glass text-white",
  "focus:outline-none focus:border-white/30",
  "focus-visible:ring-2 focus-visible:ring-accent-blue"
);

/** Validate that new sizes don't duplicate existing or each other. Returns error string or null. */
function validateSizeDuplicates(existingSizes: string[], newSizes: string[]): string | null {
  if (newSizes.length === 0) return null;

  // Check against existing sizes
  const existingSet = new Set(existingSizes.map((s) => s.toUpperCase()));
  const duplicates = newSizes.filter((s) => existingSet.has(s.toUpperCase()));
  if (duplicates.length > 0) {
    return `Размер ${duplicates.join(", ")} уже существует`;
  }

  // Check for duplicates among new sizes
  const newNames = newSizes.map((s) => s.toUpperCase());
  if (new Set(newNames).size !== newNames.length) {
    return "Размеры не должны повторяться";
  }

  return null;
}

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<StockFilter>("all");
  const orderSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (orderSuccessTimerRef.current) clearTimeout(orderSuccessTimerRef.current);
    };
  }, []);

  // ── Модалка корректировки ──
  const [adjustProduct, setAdjustProduct] = useState<StockProduct | null>(null);
  const [adjustValues, setAdjustValues] = useState<Record<string, number>>({});
  const [actualValues, setActualValues] = useState<Record<string, number | null>>({});
  const [newSizesInAdjust, setNewSizesInAdjust] = useState<
    Array<{ size: string; quantity: number }>
  >([]);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // ── Модалка создания товара ──
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBrand, setCreateBrand] = useState("");
  const [createSizes, setCreateSizes] = useState<Array<{ size: string; quantity: number }>>([
    { size: "", quantity: 0 },
  ]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPhotoFile, setCreatePhotoFile] = useState<File | null>(null);
  const [createPhotoPreview, setCreatePhotoPreview] = useState<string | null>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);

  // ── Модалка создания заказа ──
  const [orderProduct, setOrderProduct] = useState<StockProduct | null>(null);
  const [orderSizeId, setOrderSizeId] = useState<string>("");
  const [orderSize, setOrderSize] = useState<string>("");
  const [orderDeliveryService, setOrderDeliveryService] = useState<string>("cdek");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  // ── Фото ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Всегда загружаем ВСЕ товары, фильтруем на клиенте
  const { data: products, isLoading, error, refetch } = useShipperStock();
  const adjustStock = useAdjustStock();
  const createProduct = useCreateProduct();
  const createManualOrder = useCreateManualOrder();
  const uploadPhoto = useUploadProductPhoto();
  const deleteProduct = useDeleteProduct();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Фильтрация ──
  const filteredProducts = useMemo(() => {
    if (!products) return [];

    let result = products;

    // Фильтр по наличию
    if (activeFilter === "in_stock") {
      result = result.filter((p) => p.totalAvailable > 0);
    } else if (activeFilter === "out_of_stock") {
      result = result.filter((p) => p.totalAvailable <= 0);
    }

    // Поиск
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q))
      );
    }

    return result;
  }, [products, activeFilter, search]);

  // Счётчики всегда от ВСЕХ товаров (не от отфильтрованных)
  const filterCounts = useMemo(() => {
    if (!products) return { all: 0, in_stock: 0, out_of_stock: 0 };
    return {
      all: products.length,
      in_stock: products.filter((p) => p.totalAvailable > 0).length,
      out_of_stock: products.filter((p) => p.totalAvailable <= 0).length,
    };
  }, [products]);

  // ── Корректировка ──
  const openAdjust = (product: StockProduct) => {
    const values: Record<string, number> = {};
    const actuals: Record<string, number | null> = {};
    if (product.sizes.length > 0) {
      product.sizes.forEach((s) => {
        values[s.id] = s.currentQuantity;
        actuals[s.id] = s.actualQuantity;
      });
    } else {
      values["_product"] = product.currentQuantity;
      actuals["_product"] = product.totalActual;
    }
    setAdjustValues(values);
    setActualValues(actuals);
    setNewSizesInAdjust([]);
    setAdjustError(null);
    setPhotoSuccess(false);
    setConfirmDelete(false);
    setAdjustProduct(product);
  };

  const closeAdjust = () => {
    setAdjustProduct(null);
    setAdjustValues({});
    setActualValues({});
    setNewSizesInAdjust([]);
    setAdjustError(null);
    setConfirmDelete(false);
  };

  const [photoSuccess, setPhotoSuccess] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !adjustProduct) return;

    setPhotoUploading(true);
    setPhotoSuccess(false);
    setAdjustError(null);
    try {
      const result = await uploadPhoto.mutateAsync({ productId: adjustProduct.id, file });
      // Update local state so the photo appears immediately in the modal
      setAdjustProduct((prev) => (prev ? { ...prev, photoUrl: result.photoUrl } : prev));
      setPhotoSuccess(true);
      setTimeout(() => setPhotoSuccess(false), 2000);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Ошибка загрузки фото");
    } finally {
      setPhotoUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddSizeInAdjust = () => {
    setNewSizesInAdjust((prev) => [...prev, { size: "", quantity: 0 }]);
  };

  const handleSaveAdjust = async () => {
    if (!adjustProduct) return;
    setAdjustError(null);

    const validNewSizes = newSizesInAdjust.filter((s) => s.size.trim() !== "");

    const dupeError = validateSizeDuplicates(
      adjustProduct.sizes.map((s) => s.size),
      validNewSizes.map((s) => s.size)
    );
    if (dupeError) {
      setAdjustError(dupeError);
      return;
    }

    const hasExistingSizes = adjustProduct.sizes.length > 0;
    const hasAnySize = hasExistingSizes || validNewSizes.length > 0;

    // Build actual_sizes from sizes that have actual values set
    const actualSizesPayload = hasExistingSizes
      ? adjustProduct.sizes
          .filter((s) => actualValues[s.id] !== null && actualValues[s.id] !== undefined)
          .map((s) => ({
            size_id: s.id,
            actual_quantity: actualValues[s.id] as number,
          }))
      : [];

    const hasActualProduct =
      !hasAnySize && actualValues["_product"] !== null && actualValues["_product"] !== undefined;

    // Ничего не изменилось — просто закрыть
    if (validNewSizes.length === 0 && actualSizesPayload.length === 0 && !hasActualProduct) {
      closeAdjust();
      return;
    }

    try {
      await adjustStock.mutateAsync({
        productId: adjustProduct.id,
        ...(validNewSizes.length > 0 ? { new_sizes: validNewSizes } : {}),
        ...(actualSizesPayload.length > 0 ? { actual_sizes: actualSizesPayload } : {}),
        ...(hasActualProduct ? { actual_quantity: actualValues["_product"] as number } : {}),
      });
      closeAdjust();
    } catch (e) {
      setAdjustError(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  // ── Создание товара ──
  const openCreate = () => {
    setCreateName("");
    setCreateBrand("");
    setCreateSizes([{ size: "", quantity: 0 }]);
    setCreateError(null);
    setCreatePhotoFile(null);
    setCreatePhotoPreview(null);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreateError(null);
    setCreatePhotoFile(null);
    if (createPhotoPreview) URL.revokeObjectURL(createPhotoPreview);
    setCreatePhotoPreview(null);
  };

  const handleCreatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (createPhotoPreview) URL.revokeObjectURL(createPhotoPreview);
    setCreatePhotoFile(file);
    setCreatePhotoPreview(URL.createObjectURL(file));
  };

  const handleAddCreateSize = () => {
    setCreateSizes((prev) => [...prev, { size: "", quantity: 0 }]);
  };

  const handleRemoveCreateSize = (index: number) => {
    setCreateSizes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveCreate = async () => {
    setCreateError(null);

    const trimmedName = createName.trim();
    if (!trimmedName) return;

    const validSizes = createSizes.filter((s) => s.size.trim() !== "");

    const dupeError = validateSizeDuplicates(
      [],
      validSizes.map((s) => s.size)
    );
    if (dupeError) {
      setCreateError(dupeError);
      return;
    }

    try {
      const result = await createProduct.mutateAsync({
        name: trimmedName,
        brand: createBrand.trim() || undefined,
        ...(validSizes.length > 0 ? { sizes: validSizes } : { quantity: 0 }),
      });
      // Upload photo if selected
      if (createPhotoFile && result.productId) {
        try {
          await uploadPhoto.mutateAsync({ productId: result.productId, file: createPhotoFile });
        } catch {
          // Product created but photo failed — not critical
        }
      }
      closeCreate();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Ошибка создания");
    }
  };

  // ── Создание заказа из наличия ──
  const openOrderModal = (product: StockProduct) => {
    setOrderError(null);
    setOrderSuccess(null);
    setOrderDeliveryService("cdek");

    // Авто-выбор если только один размер доступен
    const availableSizes = product.sizes.filter((s) => s.currentQuantity > 0);
    if (availableSizes.length === 1) {
      setOrderSizeId(availableSizes[0].id);
      setOrderSize(availableSizes[0].size);
    } else {
      setOrderSizeId("");
      setOrderSize("");
    }

    setOrderProduct(product);
  };

  const closeOrderModal = () => {
    if (orderSuccessTimerRef.current) {
      clearTimeout(orderSuccessTimerRef.current);
      orderSuccessTimerRef.current = null;
    }
    setOrderProduct(null);
    setOrderSizeId("");
    setOrderSize("");
    setOrderError(null);
    setOrderSuccess(null);
  };

  const handleCreateOrder = async () => {
    if (!orderProduct) return;
    setOrderError(null);
    setOrderSuccess(null);

    // Если есть размеры — нужно выбрать
    const hasSizes = orderProduct.sizes.length > 0;
    if (hasSizes && !orderSizeId) {
      setOrderError("Выберите размер");
      return;
    }

    try {
      const result = await createManualOrder.mutateAsync({
        product_id: orderProduct.id,
        ...(orderSizeId ? { product_size_id: orderSizeId, size: orderSize } : {}),
        delivery_service: orderDeliveryService,
      });

      setOrderSuccess(`Заказ #${result.orderNumber} создан`);
      orderSuccessTimerRef.current = setTimeout(() => {
        orderSuccessTimerRef.current = null;
        closeOrderModal();
      }, 1200);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "Ошибка создания заказа");
    }
  };

  const canSaveCreate = createName.trim().length > 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header
        className={`sticky top-0 md:top-16 ${Z_HEADER} bg-primary backdrop-blur-xl border-b border-glass`}
      >
        <div className="max-w-4xl mx-auto px-4 py-3">
          {/* Stock Summary — 3-column grid like DaySummary */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-2 mb-3"
          >
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.value;
              const count = filterCounts[tab.value];

              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveFilter(tab.value)}
                  className={cn(
                    "relative rounded-xl px-2 py-3 text-center transition-all duration-200",
                    "border backdrop-blur-xl",
                    isActive
                      ? [
                          "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
                          "border-white/25",
                          "shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]",
                        ]
                      : [
                          "bg-white/[0.04] border-white/10",
                          "hover:bg-white/[0.08] hover:border-white/15",
                        ]
                  )}
                >
                  <div
                    className={cn("text-2xl font-bold tabular-nums", tab.color)}
                    style={isActive ? { textShadow: `0 0 12px ${tab.glowColor}` } : undefined}
                  >
                    {count}
                  </div>
                  <div className="text-xs text-white/50 mt-1 leading-tight">{tab.label}</div>
                </button>
              );
            })}
          </motion.div>

          {/* Поиск + Добавить */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Поиск по названию..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                }
              />
            </div>
            <Button onClick={openCreate} size="sm" className="flex-shrink-0 self-center">
              + Добавить
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <StockCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "text-center py-12 rounded-2xl",
              "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
              "border border-glass"
            )}
          >
            <div className="text-4xl mb-3">😔</div>
            <p className="text-white/60 mb-4">Ошибка загрузки товаров</p>
            <Button variant="secondary" onClick={() => refetch()}>
              Повторить
            </Button>
          </motion.div>
        ) : filteredProducts.length === 0 ? (
          <Empty
            title={search ? "Ничего не найдено" : "Товаров пока нет"}
            description={
              search ? "Попробуйте изменить поисковый запрос" : "Добавьте первый товар кнопкой выше"
            }
            icon={search ? "🔍" : "📦"}
            action={
              !search ? (
                <Button onClick={openCreate} size="sm">
                  + Добавить товар
                </Button>
              ) : undefined
            }
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product, index) => (
              <motion.div key={product.id} transition={{ delay: index * 0.03 }}>
                <StockCard
                  product={product}
                  onClick={() => openAdjust(product)}
                  onCreateOrder={() => openOrderModal(product)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </main>

      {/* ═══════════════════════════════════════ */}
      {/* Модалка корректировки                   */}
      {/* ═══════════════════════════════════════ */}
      <Modal isOpen={!!adjustProduct} onClose={closeAdjust} title="Корректировка">
        {adjustProduct && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {/* ── Шапка товара ── */}
            <div
              className={cn(
                "relative flex items-center gap-3 p-3 rounded-2xl overflow-hidden",
                "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                "border border-glass"
              )}
            >
              {/* Декоративный блик */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              {/* Фото (56px как в stock-card) */}
              <div
                className={cn(
                  "relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0",
                  "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
                  "border border-glass-subtle",
                  "shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                )}
              >
                {adjustProduct.photoUrl ? (
                  <img src={adjustProduct.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/20">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white truncate">
                  {adjustProduct.name}
                </p>
                {adjustProduct.brand && (
                  <p className="text-[11px] text-white/50">{adjustProduct.brand}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                      "bg-accent-blue/20 text-accent-blue border border-accent-blue/30",
                      "active:bg-accent-blue/30",
                      "disabled:opacity-50"
                    )}
                  >
                    {photoUploading
                      ? "Загрузка..."
                      : adjustProduct.photoUrl
                        ? "Заменить фото"
                        : "Добавить фото"}
                  </button>
                  {photoSuccess && (
                    <span className="text-[11px] text-accent-green font-medium animate-in fade-in">
                      Загружено
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Инвентаризация (размеры) ── */}
            {adjustProduct.sizes.length > 0 && (
              <div
                className={cn(
                  "rounded-2xl overflow-hidden",
                  "bg-gradient-to-b from-accent-blue/[0.06] to-white/[0.03]",
                  "border border-accent-blue/20"
                )}
              >
                {/* Заголовок секции */}
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                  <div className="flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5 text-accent-blue"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                    <span className="text-[11px] font-semibold text-accent-blue uppercase tracking-wider">
                      Наличие
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-[52px] text-center text-[10px] text-white/40">учёт</span>
                    <span className="w-[52px] text-center text-[10px] font-medium text-accent-blue/80">
                      факт
                    </span>
                  </div>
                </div>

                {/* Строки размеров */}
                <div className="px-3 pb-2 space-y-1">
                  {sortSizeEntries(adjustProduct.sizes).map((s) => {
                    const hasDiscrepancy =
                      actualValues[s.id] !== null &&
                      actualValues[s.id] !== undefined &&
                      actualValues[s.id] !== adjustValues[s.id];
                    const isMatched =
                      actualValues[s.id] !== null &&
                      actualValues[s.id] !== undefined &&
                      actualValues[s.id] === adjustValues[s.id];
                    const qty = adjustValues[s.id] ?? 0;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "flex items-center justify-between gap-3 py-2 px-2.5 rounded-xl transition-colors",
                          hasDiscrepancy
                            ? "bg-amber-500/10 border-l-2 border-l-amber-500 border-r-2 border-r-amber-500"
                            : isMatched
                              ? "bg-[rgba(48,209,88,0.12)] border-l-2 border-l-accent-green border-r-2 border-r-accent-green"
                              : "bg-white/[0.03]"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[13px] font-semibold min-w-[2rem]",
                            qty > 0 ? "text-white" : "text-accent-red/60"
                          )}
                        >
                          {s.size}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* Учёт — read-only */}
                          <span
                            className={cn(
                              "w-[52px] text-center text-[13px] font-medium tabular-nums",
                              qty > 0 ? "text-white/40" : "text-accent-red/40"
                            )}
                          >
                            {qty}
                          </span>
                          {/* Факт — editable */}
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="—"
                            value={actualValues[s.id] ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "");
                              setActualValues((prev) => ({
                                ...prev,
                                [s.id]: raw === "" ? null : parseInt(raw, 10),
                              }));
                            }}
                            className={cn(
                              "w-[52px] px-1 py-1.5 rounded-lg text-center text-[13px] font-medium tabular-nums",
                              "bg-white/[0.06] border transition-colors",
                              "focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue",
                              hasDiscrepancy
                                ? "border-amber-500/60 text-amber-400 bg-amber-500/10"
                                : isMatched
                                  ? "border-accent-green/80 text-accent-green bg-[rgba(48,209,88,0.10)]"
                                  : "border-glass text-white/70 focus:border-accent-blue/50"
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Товар без размеров ── */}
            {adjustProduct.sizes.length === 0 &&
              newSizesInAdjust.length === 0 &&
              (() => {
                const noSizeDiscrepancy =
                  actualValues["_product"] !== null &&
                  actualValues["_product"] !== undefined &&
                  actualValues["_product"] !== adjustValues["_product"];
                const noSizeMatched =
                  actualValues["_product"] !== null &&
                  actualValues["_product"] !== undefined &&
                  actualValues["_product"] === adjustValues["_product"];
                return (
                  <div
                    className={cn(
                      "rounded-2xl overflow-hidden",
                      "bg-gradient-to-b from-accent-blue/[0.06] to-white/[0.03]",
                      "border border-accent-blue/20"
                    )}
                  >
                    <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
                      <svg
                        className="w-3.5 h-3.5 text-accent-blue"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                      <span className="text-[11px] font-semibold text-accent-blue uppercase tracking-wider">
                        Наличие
                      </span>
                    </div>
                    <div className="px-3 pb-3 space-y-2">
                      <div className="flex items-center justify-between py-2 px-2.5 rounded-xl bg-white/[0.03]">
                        <span className="text-[13px] font-medium text-white/50">Учёт</span>
                        <span className="text-[13px] font-medium tabular-nums text-white/40">
                          {adjustValues["_product"] ?? 0}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "flex items-center justify-between py-1.5 px-2.5 rounded-xl transition-colors",
                          noSizeDiscrepancy
                            ? "bg-amber-500/10 border-l-2 border-l-amber-500 border-r-2 border-r-amber-500"
                            : noSizeMatched
                              ? "bg-[rgba(48,209,88,0.12)] border-l-2 border-l-accent-green border-r-2 border-r-accent-green"
                              : "bg-white/[0.03]"
                        )}
                      >
                        <span className="text-[13px] font-medium text-white/50">Факт</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="—"
                          value={actualValues["_product"] ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            setActualValues((prev) => ({
                              ...prev,
                              _product: raw === "" ? null : parseInt(raw, 10),
                            }));
                          }}
                          className={cn(
                            "w-[52px] px-1 py-1.5 rounded-lg text-center text-[13px] font-medium tabular-nums",
                            "bg-white/[0.06] border transition-colors",
                            "focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue",
                            noSizeDiscrepancy
                              ? "border-amber-500/60 text-amber-400 bg-amber-500/10"
                              : noSizeMatched
                                ? "border-accent-green/80 text-accent-green bg-[rgba(48,209,88,0.10)]"
                                : "border-glass text-white/70 focus:border-accent-blue/50"
                          )}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* ── Новые размеры ── */}
            {newSizesInAdjust.length > 0 && (
              <div
                className={cn(
                  "rounded-2xl overflow-hidden",
                  "bg-gradient-to-b from-accent-green/[0.06] to-white/[0.03]",
                  "border border-accent-green/20"
                )}
              >
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
                  <svg
                    className="w-3.5 h-3.5 text-accent-green"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span className="text-[11px] font-semibold text-accent-green uppercase tracking-wider">
                    Новые размеры
                  </span>
                </div>
                <div className="px-3 pb-3 space-y-1.5">
                  {newSizesInAdjust.map((ns, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 py-1 px-2.5 rounded-xl bg-white/[0.03]"
                    >
                      <input
                        type="text"
                        placeholder="XS"
                        value={ns.size}
                        onChange={(e) =>
                          setNewSizesInAdjust((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, size: e.target.value.toUpperCase() } : s
                            )
                          )
                        }
                        className={cn(
                          "w-14 px-2 py-1.5 rounded-lg text-center text-[13px] font-semibold uppercase",
                          "bg-white/[0.06] border border-glass text-white/80",
                          "focus:outline-none focus:border-white/30",
                          "focus-visible:ring-1 focus-visible:ring-accent-blue"
                        )}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={ns.quantity}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          setNewSizesInAdjust((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, quantity: raw === "" ? 0 : parseInt(raw, 10) } : s
                            )
                          );
                        }}
                        className={cn(
                          "w-[52px] px-1 py-1.5 rounded-lg text-center text-[13px] font-medium tabular-nums",
                          "bg-white/[0.06] border border-glass text-white/70",
                          "focus:outline-none focus:border-white/30",
                          "focus-visible:ring-1 focus-visible:ring-accent-blue"
                        )}
                      />
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() =>
                          setNewSizesInAdjust((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-white/20 active:text-accent-red transition-colors p-1"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Добавить размер ── */}
            <button
              type="button"
              onClick={handleAddSizeInAdjust}
              className={cn(
                "w-full py-2.5 rounded-xl text-[13px] font-medium",
                "border border-dashed border-accent-blue/30 active:border-accent-blue/50",
                "text-accent-blue/70 active:text-accent-blue",
                "bg-accent-blue/[0.04] active:bg-accent-blue/10",
                "transition-all duration-150",
                "flex items-center justify-center gap-1.5"
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Добавить размер
            </button>

            {/* ── Ошибка ── */}
            {adjustError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-red/10 border border-accent-red/20">
                <svg
                  className="w-4 h-4 text-accent-red flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <p className="text-[13px] text-accent-red">{adjustError}</p>
              </div>
            )}
          </div>
        )}

        <ModalFooter className="!justify-between">
          {/* Удаление — слева */}
          <div className="flex-shrink-0">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className={cn(
                  "p-2 rounded-xl transition-colors",
                  "text-white/30 active:text-accent-red active:bg-accent-red/10"
                )}
                aria-label="Удалить товар"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={deleteProduct.isPending}
                  onClick={async () => {
                    if (!adjustProduct) return;
                    setAdjustError(null);
                    try {
                      await deleteProduct.mutateAsync(adjustProduct.id);
                      closeAdjust();
                    } catch (e) {
                      setAdjustError(e instanceof Error ? e.message : "Ошибка удаления");
                      setConfirmDelete(false);
                    }
                  }}
                  className={cn(
                    "px-3 py-2 rounded-xl text-[13px] font-medium",
                    "bg-accent-red/15 text-accent-red active:bg-accent-red/25",
                    "transition-colors",
                    "disabled:opacity-50"
                  )}
                >
                  {deleteProduct.isPending ? "Удаление..." : "Удалить"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={cn(
                    "px-2 py-2 rounded-xl text-[13px]",
                    "text-white/40 active:text-white/60",
                    "transition-colors"
                  )}
                >
                  Нет
                </button>
              </div>
            )}
          </div>

          {/* Действия — справа */}
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={closeAdjust}>
              Отмена
            </Button>
            <Button onClick={handleSaveAdjust} isLoading={adjustStock.isPending}>
              Сохранить
            </Button>
          </div>
        </ModalFooter>
      </Modal>

      {/* ═══════════════════════════════════════ */}
      {/* Модалка создания товара                 */}
      {/* ═══════════════════════════════════════ */}
      <Modal isOpen={showCreate} onClose={closeCreate} title="Новый товар">
        <div className="space-y-4">
          {/* Фото */}
          <div className="flex items-center gap-3">
            {createPhotoPreview ? (
              <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.08] border border-glass">
                <img src={createPhotoPreview} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-xl flex items-center justify-center bg-white/[0.06] border border-dashed border-white/20 flex-shrink-0">
                <svg
                  className="w-7 h-7 text-white/20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
            <div>
              <input
                ref={createFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCreatePhotoSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => createFileInputRef.current?.click()}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  "bg-accent-blue/20 text-accent-blue border border-accent-blue/30",
                  "active:bg-accent-blue/30"
                )}
              >
                {createPhotoPreview ? "Заменить фото" : "Добавить фото"}
              </button>
            </div>
          </div>

          <Input
            label="Название"
            placeholder="Например: Футболка базовая"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />

          <Input
            label="Бренд (необязательно)"
            placeholder="Например: Nike"
            value={createBrand}
            onChange={(e) => setCreateBrand(e.target.value)}
          />

          {/* Размеры */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/80">Размеры</p>
            {createSizes.map((cs, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="XS"
                  value={cs.size}
                  onChange={(e) =>
                    setCreateSizes((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, size: e.target.value.toUpperCase() } : s
                      )
                    )
                  }
                  className={sizeTextInputCls}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={cs.quantity}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setCreateSizes((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, quantity: raw === "" ? 0 : parseInt(raw, 10) } : s
                      )
                    );
                  }}
                  className={numberInputCls}
                />
                {createSizes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCreateSize(idx)}
                    className="text-white/30 hover:text-accent-red transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddCreateSize}
              className={cn(
                "w-full py-2.5 rounded-xl text-[13px] font-medium",
                "border border-dashed border-accent-blue/30 active:border-accent-blue/50",
                "text-accent-blue/70 active:text-accent-blue",
                "bg-accent-blue/[0.04] active:bg-accent-blue/10",
                "transition-all duration-150",
                "flex items-center justify-center gap-1.5"
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Ещё размер
            </button>
          </div>

          {/* Ошибка */}
          {createError && <p className="text-sm text-accent-red">{createError}</p>}
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={closeCreate}>
            Отмена
          </Button>
          <Button
            onClick={handleSaveCreate}
            isLoading={createProduct.isPending}
            disabled={!canSaveCreate}
          >
            Создать
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══════════════════════════════════════ */}
      {/* Модалка создания заказа                 */}
      {/* ═══════════════════════════════════════ */}
      <Modal
        isOpen={!!orderProduct}
        onClose={closeOrderModal}
        title="Создать заказ"
        description={orderProduct?.name}
      >
        {orderProduct && (
          <div className="space-y-4">
            {/* Выбор размера */}
            {orderProduct.sizes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-white/80">Размер</p>
                <div className="flex flex-wrap gap-2">
                  {sortSizeEntries(orderProduct.sizes)
                    .filter((s) => s.currentQuantity > 0)
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setOrderSizeId(s.id);
                          setOrderSize(s.size);
                        }}
                        className={cn(
                          "px-3 py-2 rounded-xl text-sm font-medium transition-all",
                          "border",
                          orderSizeId === s.id
                            ? [
                                "bg-accent-blue/20 border-accent-blue/40 text-white",
                                "shadow-[0_0_12px_rgba(10,132,255,0.2)]",
                              ]
                            : "bg-white/[0.06] border-glass text-white/70 hover:bg-white/[0.10]"
                        )}
                      >
                        {s.size}
                        <span className="ml-1 text-xs opacity-60">({s.currentQuantity})</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Выбор службы доставки */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-white/80">Служба доставки</p>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_SERVICES.map((ds) => (
                  <button
                    key={ds.value}
                    type="button"
                    onClick={() => setOrderDeliveryService(ds.value)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm font-medium transition-all",
                      "border",
                      orderDeliveryService === ds.value
                        ? [
                            "bg-accent-blue/20 border-accent-blue/40 text-white",
                            "shadow-[0_0_12px_rgba(10,132,255,0.2)]",
                          ]
                        : "bg-white/[0.06] border-glass text-white/70 hover:bg-white/[0.10]"
                    )}
                  >
                    {ds.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ошибка */}
            {orderError && <p className="text-sm text-accent-red">{orderError}</p>}

            {/* Успех */}
            {orderSuccess && <p className="text-sm text-accent-green">{orderSuccess}</p>}
          </div>
        )}

        <ModalFooter>
          <Button variant="secondary" onClick={closeOrderModal}>
            Отмена
          </Button>
          <Button
            onClick={handleCreateOrder}
            isLoading={createManualOrder.isPending}
            disabled={!!orderSuccess}
          >
            Создать заказ
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

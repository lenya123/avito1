"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProductAvitoMedia } from "@/components/owner/avito/product-avito-media";
import { ProductAvitoListings } from "@/components/owner/avito/product-avito-listings";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import {
  useOwnerProduct,
  useUpdateProduct,
  useDeleteProduct,
  type ProductBindingInput,
} from "@/hooks/use-owner-products";
import { useOwnerPartnersList } from "@/hooks/use-owner-partners";
import { PartnerLadderEditor } from "@/components/owner/products/partner-ladder-editor";
import { ProductBatchesEditor } from "@/components/owner/products/product-batches-editor";
import { ProductSizesEditor } from "@/components/owner/products/product-sizes-editor";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGE_VARIANTS as STATUS_VARIANTS,
} from "@/lib/constants/order-status";
import { ProductSalesChart } from "@/components/owner/products";
import { CatalogPublishModal } from "@/components/owner/products/catalog-publish-modal";
import { DescriptionTemplateButton } from "@/components/owner/products/description-template-button";
import { RUSSIAN_CITIES, findCity } from "@/lib/constants/cities";
import { PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import type { OrderStatus } from "@/types/database";
import {
  ErrorState,
  Button,
  BackButton,
  Card,
  CardContent,
  CardHeader,
  Badge,
  Modal,
  Input,
  Skeleton,
  Toggle,
} from "@/components/ui";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const { data, isLoading, error, refetch } = useOwnerProduct(productId);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { data: partners = [] } = useOwnerPartnersList();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCatalogPublishModal, setShowCatalogPublishModal] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    description: "",
    purchasePrice: "",
    dropPrice: "",
    recommendedPrice: "",
    isPremium: false,
    isActive: true,
    isInStock: true,
    locationCity: "",
    expectedArrivalDate: "",
    // Только структура (имена размеров). Количество/закупка — в разделе
    // «Партии закупок» (канон §11.5).
    sizes: [] as Array<{ size: string; measurements: Record<string, number> }>,
  });

  // Лестница привязок партнёров — отдельное состояние, потому что DND-редактор
  // принимает массив, а не запоминается в form-state.
  const [editBindings, setEditBindings] = useState<ProductBindingInput[]>([]);

  // City autocomplete state
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [cityWarning, setCityWarning] = useState("");
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  const handleCityInput = useCallback((value: string) => {
    setEditForm((prev) => ({ ...prev, locationCity: value }));
    setCityWarning("");
    if (!value.trim()) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    const lower = value.trim().toLowerCase();
    const startsWith: string[] = [];
    const includes: string[] = [];
    for (const city of RUSSIAN_CITIES) {
      const cl = city.toLowerCase();
      if (cl.startsWith(lower)) startsWith.push(city);
      else if (cl.includes(lower)) includes.push(city);
      if (startsWith.length + includes.length >= 8) break;
    }
    const results = [...startsWith, ...includes].slice(0, 8);
    setCitySuggestions(results);
    setShowCitySuggestions(results.length > 0);
  }, []);

  const handleCityBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setShowCitySuggestions(false);
      setEditForm((prev) => {
        const found = findCity(prev.locationCity);
        if (prev.locationCity.trim() && !found) {
          setCityWarning("Город не найден в справочнике");
          return prev;
        }
        setCityWarning("");
        return found ? { ...prev, locationCity: found } : prev;
      });
    }, 150);
  }, []);

  const handleCitySelect = useCallback((city: string) => {
    setEditForm((prev) => ({ ...prev, locationCity: city }));
    setCitySuggestions([]);
    setShowCitySuggestions(false);
    setCityWarning("");
  }, []);

  // Close city dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setShowCitySuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openEditModal = () => {
    if (!data) return;
    const { product } = data;
    setEditForm({
      name: product.name,
      category: product.category || "",
      description: product.description || "",
      purchasePrice: product.purchasePrice.toString(),
      dropPrice: product.dropPrice.toString(),
      recommendedPrice: product.recommendedPrice?.toString() || "",
      isPremium: product.isPremium,
      isActive: product.isActive,
      isInStock: product.isInStock,
      locationCity: product.locationCity || "",
      expectedArrivalDate: product.expectedArrivalDate || "",
      sizes: product.sizes.map((s) => ({
        size: s.size,
        measurements: s.measurements ?? {},
      })),
    });
    setEditBindings(
      product.bindings.map((b) => ({
        id: b.id,
        partnerId: b.partnerId,
        warehouseKind: b.warehouseKind,
        commission: b.commission,
        sizes: b.sizes.map((s) => ({ size: s.size, currentQuantity: s.currentQuantity })),
      }))
    );
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProduct.mutateAsync({
        productId,
        name: editForm.name,
        category: editForm.category || null,
        description: editForm.description || null,
        // Закупочная НЕ отсюда — это средневзвешенная из партий (§11.5),
        // считается RPC. Форма меняет только название/структуру/флаги.
        dropPrice: parseFloat(editForm.dropPrice) || 0,
        recommendedPrice: editForm.recommendedPrice ? parseFloat(editForm.recommendedPrice) : null,
        isPremium: editForm.isPremium,
        isActive: editForm.isActive,
        isInStock: editForm.isInStock,
        locationCity: editForm.locationCity.trim() || undefined,
        expectedArrivalDate: editForm.expectedArrivalDate || null,
        // Размеры — только набор имён. Количество существующих берём
        // СВЕЖЕЕ из data (не из stale-формы): replace_product_sizes ставит
        // current = переданному; шлём актуальное → не затираем партии.
        // Новый размер → 0 (сток заводится через «Новую партию»).
        sizes: editForm.sizes.map((s) => ({
          size: s.size,
          quantity: data?.product.sizes.find((ps) => ps.size === s.size)?.currentQuantity ?? 0,
        })),
        // Замеры пер-размер (§11.6) — применяются после replace_product_sizes.
        sizeMeasurements: editForm.sizes.map((s) => ({
          size: s.size,
          measurements: s.measurements,
        })),
        bindings: editBindings,
      });
      setShowEditModal(false);
    } catch {
      // Error shown via mutation state
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProduct.mutateAsync(productId);
      router.replace("/owner/products");
    } catch {
      // Error shown via mutation state
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    try {
      await updateProduct.mutateAsync({
        productId,
        isActive: checked,
      });
    } catch {
      // Error shown via mutation state
    }
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить данные товара"
          onRetry={refetch}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { product, sales, recentOrders, salesChart, salesGranularity, reconciliation, batches } =
    data;

  // Финансы — единый канон §9.3/§9.4 (значения считает API через общий
  // хелпер: партнёрский = комиссия; свой = client_price − purchase_price
  // − shipper_rate_snapshot, часть C закрыта 18.05). «Вложено» —
  // отдельная метрика закупки (не §9.3).
  const revenue = sales.revenue;
  const costOfSold = sales.cost;
  const profit = sales.profit;
  const invested = product.purchasePrice * product.totalInitial;
  const roi = costOfSold > 0 ? Math.round((profit / costOfSold) * 100) : 0;
  const avgMarginPerUnit = sales.revenueCount > 0 ? Math.round(profit / sales.revenueCount) : 0;
  // Маржинальность продаж = прибыль ÷ выручка (рентабельность продаж,
  // не дублирует ROI = прибыль ÷ себестоимость). Нет выручки → 0%.
  const avgMarginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  // % успешных = доля «завершённых» (sent) от всех заказов товара.
  const completionPct = sales.total > 0 ? Math.round((sales.completed / sales.total) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Back + Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <BackButton href="/owner/products" />

        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Photo + Info */}
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-white/[0.08] flex-shrink-0">
              {product.coverUrl ? (
                <img
                  src={product.coverUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg
                    className="w-7 h-7 text-white/20"
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
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{product.name}</h1>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {product.isPremium && (
                  <Badge variant="purple" size="sm">
                    Premium
                  </Badge>
                )}
                {product.isInStock ? (
                  <Badge variant="success" size="sm">
                    В наличии
                  </Badge>
                ) : product.expectedArrivalDate ? (
                  <Badge variant="warning" size="sm">
                    В пути
                  </Badge>
                ) : (
                  <Badge variant="error" size="sm">
                    Распродан
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Toggle
              size="sm"
              checked={product.isActive}
              onChange={handleToggleActive}
              disabled={updateProduct.isPending}
              label={product.isActive ? "Активный" : "Неактивный"}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCatalogPublishModal(true)}
              disabled={!product.isActive}
              title={
                product.isActive
                  ? "Опубликовать карточку товара в Telegram-канал каталога"
                  : "Активируй товар, чтобы опубликовать"
              }
            >
              📢 В каталог
            </Button>
            <Button variant="secondary" size="sm" onClick={openEditModal}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </Button>
            <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Info row — category, created, city */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-white/40 mb-1">Создан</p>
                <p className="text-sm font-medium text-white">
                  {product.createdAt
                    ? new Date(product.createdAt).toLocaleDateString("ru-RU")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Категория</p>
                <p className="text-sm font-medium text-white">{product.category || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Город отправки</p>
                <p className="text-sm font-medium text-white">{product.locationCity || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Prices */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-white/40 mb-1">Закупочная</p>
                <p className="text-lg font-bold text-white">
                  {product.purchasePrice.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Клиент платит</p>
                <p className="text-lg font-bold text-accent-green">
                  {product.dropPrice.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Рекомендуемая</p>
                <p className="text-lg font-bold text-white">
                  {product.recommendedPrice
                    ? `${product.recommendedPrice.toLocaleString("ru-RU")} ₽`
                    : "—"}
                </p>
              </div>
            </div>
            {product.bindings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-glass text-sm space-y-2">
                <p className="text-xs text-white/40">🤝 Партнёры в очереди</p>
                <ol className="space-y-1.5">
                  {product.bindings.map((b) => {
                    const totalQty = b.sizes.reduce((sum, s) => sum + s.currentQuantity, 0);
                    return (
                      <li key={b.id} className="flex items-center gap-2 text-white/80">
                        <span className="text-xs font-bold text-white/50">#{b.priority}</span>
                        <a
                          href={`/owner/partners/${b.partnerId}`}
                          className="text-accent-blue hover:underline"
                        >
                          {b.partnerName}
                        </a>
                        <span className="text-white/40 text-xs">
                          · {b.warehouseKind === "owner" ? "📦 у меня" : "🤝 у партнёра"}
                        </span>
                        <span className="text-white/40 text-xs">
                          · комиссия {b.commission.toLocaleString("ru-RU")} ₽
                        </span>
                        <span className="text-white/40 text-xs">· остаток {totalQty} шт</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Orders stats + Finances — 2 columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Заказы</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/40 mb-1">Всего</p>
                  <p className="text-lg font-bold text-white">{sales.total}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Отменённых</p>
                  <p className="text-lg font-bold text-white/60">{sales.cancelled}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Завершённых</p>
                  <p className="text-lg font-bold text-accent-green">
                    {sales.completed}
                    <span className="text-sm font-normal text-white/40 ml-1">
                      ({completionPct}%)
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Возвраты</p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      sales.returns === 0 ? "text-white/60" : "text-accent-orange"
                    )}
                  >
                    {sales.returns}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Finances */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Финансы</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/40 mb-1">Вложено</p>
                  <p className="text-lg font-bold text-white">
                    {invested.toLocaleString("ru-RU")} ₽
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Выручка</p>
                  <p className="text-lg font-bold text-white">
                    {revenue.toLocaleString("ru-RU")} ₽
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Прибыль (ROI)</p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      profit >= 0 ? "text-accent-green" : "text-accent-red"
                    )}
                  >
                    {profit >= 0 ? "+" : ""}
                    {profit.toLocaleString("ru-RU")} ₽
                    <span className="text-sm font-normal text-white/40 ml-1">({roi}%)</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Ср. маржа</p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      avgMarginPerUnit >= 0 ? "text-accent-green" : "text-accent-red"
                    )}
                  >
                    {avgMarginPerUnit >= 0 ? "+" : ""}
                    {avgMarginPerUnit.toLocaleString("ru-RU")} ₽
                    <span className="text-sm font-normal text-white/40 ml-1">
                      ({avgMarginPct >= 0 ? "+" : ""}
                      {avgMarginPct}%)
                    </span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Sales velocity + Sizes */}
      {product.sizes.length > 0 &&
        (() => {
          // «Продано» — по заказам (paid/collecting/sent, канон §4.2),
          // НЕ initial−current (то ломалось при ресток/возвратах).
          const totalSold = sales.sold;
          const totalStock = product.totalStock;
          // Sell-through: доля распроданного от прошедшего через склад.
          // Всегда 0–100%, устойчиво к ресток/возвратам.
          const throughBase = totalSold + totalStock;
          const soldPercent = throughBase > 0 ? Math.round((totalSold / throughBase) * 100) : 0;

          // Темп: продажи за последние 30 дней / окно (не больше возраста
          // товара, чтобы свежий товар не делился на 30 и не занижался).
          const daysSinceFirst = sales.firstOrderAt
            ? Math.max(
                1,
                Math.floor(
                  (Date.now() - new Date(sales.firstOrderAt).getTime()) / (1000 * 60 * 60 * 24)
                )
              )
            : 0;
          const windowDays = Math.min(30, Math.max(1, daysSinceFirst));
          const velocity = daysSinceFirst > 0 ? sales.soldLast30 / windowDays : 0;
          const isFreshPace = daysSinceFirst > 0 && daysSinceFirst < 7;
          const daysToSellOut = velocity > 0 ? Math.ceil(totalStock / velocity) : null;

          // Velocity label
          const velocityLabel =
            velocity >= 3
              ? "Хит"
              : velocity >= 1
                ? "Хороший темп"
                : velocity >= 0.3
                  ? "Стабильно"
                  : velocity > 0
                    ? "Медленно"
                    : "Нет продаж";
          const velocityColor =
            velocity >= 3
              ? "text-accent-green"
              : velocity >= 1
                ? "text-accent-blue"
                : velocity >= 0.3
                  ? "text-white/80"
                  : "text-white/40";

          return (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <h3 className="font-semibold text-white">Склад и темп продаж</h3>
                  <span className={cn("text-sm font-medium", velocityColor)}>{velocityLabel}</span>
                </CardHeader>
                <CardContent>
                  {/* Sell-through bar: продано / (продано + остаток) */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/60">
                        Продано {totalSold} · остаток {totalStock} шт.
                      </span>
                      <span className="text-sm font-bold text-white">
                        Распродано {soldPercent}%
                      </span>
                    </div>
                    <div
                      className={cn(
                        "h-3 rounded-full overflow-hidden",
                        "bg-white/[0.08]",
                        "border border-glass-minimal"
                      )}
                    >
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          soldPercent >= 90
                            ? "bg-accent-red"
                            : soldPercent >= 60
                              ? "bg-accent-orange"
                              : "bg-accent-green"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${soldPercent}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      {velocity > 0 ? (
                        <span className="text-xs text-white/40">
                          ~{velocity.toFixed(1)} шт./день · 30 дн
                          {isFreshPace ? " (предварительно)" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-white/40">Нет продаж за 30 дней</span>
                      )}
                      {totalStock === 0 && totalSold > 0 ? (
                        <span className="text-xs font-medium text-accent-green">Всё продано!</span>
                      ) : daysToSellOut !== null && totalStock > 0 ? (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            daysToSellOut <= 7
                              ? "text-accent-red"
                              : daysToSellOut <= 30
                                ? "text-accent-orange"
                                : "text-white/60"
                          )}
                        >
                          остатка ~{daysToSellOut}{" "}
                          {daysToSellOut % 10 === 1 && daysToSellOut % 100 !== 11
                            ? "день"
                            : daysToSellOut % 10 >= 2 &&
                                daysToSellOut % 10 <= 4 &&
                                (daysToSellOut % 100 < 10 || daysToSellOut % 100 >= 20)
                              ? "дня"
                              : "дней"}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Sales chart */}
                  {salesChart && (
                    <ProductSalesChart data={salesChart} granularity={salesGranularity} />
                  )}

                  {/* Sizes grid */}
                  <div className="pt-4 border-t border-glass">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-white/60">Размеры</p>
                      <p className="text-xs text-white/40">Осталось: {product.totalStock} шт.</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                      {product.sizes.map((size) => {
                        // Продано по заказам (устойчиво к ресток/возвратам),
                        // sell-through = продано / (продано + остаток).
                        const sold = size.sold;
                        const sizeBase = sold + size.currentQuantity;
                        const sizePercent = sizeBase > 0 ? Math.round((sold / sizeBase) * 100) : 0;
                        return (
                          <div
                            key={size.id}
                            className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-center"
                          >
                            <p className="font-medium text-white mb-1">{size.size}</p>
                            <p
                              className={cn(
                                "text-lg font-bold",
                                size.currentQuantity === 0
                                  ? "text-accent-red"
                                  : size.currentQuantity <= 2
                                    ? "text-accent-orange"
                                    : "text-accent-green"
                              )}
                            >
                              {size.currentQuantity}
                            </p>
                            {/* Mini progress per size */}
                            <div className="h-1 rounded-full bg-white/[0.08] mt-1.5 mb-1 overflow-hidden">
                              <motion.div
                                className={cn(
                                  "h-full rounded-full",
                                  sizePercent >= 90
                                    ? "bg-accent-red/60"
                                    : sizePercent >= 60
                                      ? "bg-accent-orange/60"
                                      : "bg-accent-green/60"
                                )}
                                initial={{ width: 0 }}
                                animate={{ width: `${sizePercent}%` }}
                                transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
                              />
                            </div>
                            <p className="text-xs text-white/40">
                              {sold} прод. · {sizePercent}%
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}

      {/* Недостачи / сверки инвентаризации */}
      {reconciliation.events.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.27 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold text-white">Недостачи / сверки</h3>
              <div className="flex items-center gap-3 text-sm">
                {reconciliation.lossUnits > 0 && (
                  <span className="font-bold text-accent-red">
                    −{reconciliation.lossUnits} шт
                    {reconciliation.lossRub > 0
                      ? ` · −${reconciliation.lossRub.toLocaleString("ru-RU")} ₽`
                      : ""}
                  </span>
                )}
                {reconciliation.surplusUnits > 0 && (
                  <span className="font-medium text-accent-green">
                    +{reconciliation.surplusUnits} шт излишек
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-white/40 mb-3">
                Расхождения физического пересчёта (инвентаризация отправщика) с системным остатком.
                Остаток сверен по факту автоматически.
              </p>
              <div className="space-y-2">
                {reconciliation.events.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-glass-minimal last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-white/80 font-medium shrink-0">{e.size || "—"}</span>
                      <span className="text-white/40 text-xs truncate">
                        {e.systemBefore} → {e.counted} шт
                        {e.by ? ` · ${e.by}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={cn(
                          "font-semibold",
                          e.delta > 0 ? "text-accent-red" : "text-accent-green"
                        )}
                      >
                        {e.delta > 0 ? `−${e.delta}` : `+${-e.delta}`} шт
                        {e.delta > 0 && e.rub > 0 ? ` · −${e.rub.toLocaleString("ru-RU")} ₽` : ""}
                      </span>
                      <span className="text-xs text-white/40">
                        {new Date(e.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Живой фотосет (Авито) — per-product датасет для объявлений и AI-генерации */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="mb-6"
      >
        <ProductAvitoMedia productId={productId} />
      </motion.div>

      {/* Авито-объявления, привязанные к товару (ТЗ §3.2) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.29 }}
        className="mb-6"
      >
        <ProductAvitoListings productId={productId} />
      </motion.div>

      {/* Recent orders */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="font-semibold text-white">Последние заказы</h3>
            <Link
              href={`/owner/orders?productId=${productId}`}
              className="text-sm text-accent-blue hover:text-accent-blue/80"
            >
              Все заказы
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-white/60 text-center py-4">Нет заказов</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/owner/orders/${order.id}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">#{order.orderNumber}</span>
                        <Badge
                          variant={STATUS_VARIANTS[order.status as OrderStatus] || "default"}
                          size="sm"
                        >
                          {ORDER_STATUS_LABELS[order.status as OrderStatus] || order.status}
                        </Badge>
                        {order.size && <span className="text-xs text-white/40">{order.size}</span>}
                      </div>
                      <p className="text-xs text-white/60 truncate">
                        {order.clientUsername ? `@${order.clientUsername}` : "Клиент"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">
                        {order.price.toLocaleString("ru-RU")} ₽
                      </p>
                      <p className="text-xs text-white/40">
                        {new Date(order.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Edit modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Редактировать товар"
        size="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Название"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Категория</label>
            <select
              value={editForm.category}
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl appearance-none",
                "bg-white/[0.06] border border-glass text-white",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue",
                "transition-all duration-200",
                !editForm.category && "text-white/40"
              )}
            >
              <option value="">Без категории</option>
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* City autocomplete */}
          <div className="relative" ref={cityDropdownRef}>
            <Input
              label="Город отправки *"
              value={editForm.locationCity}
              onChange={(e) => handleCityInput(e.target.value)}
              onBlur={handleCityBlur}
              placeholder="Начните вводить название города"
              error={!editForm.locationCity.trim() ? "Город обязателен" : undefined}
            />
            {cityWarning && editForm.locationCity.trim() && (
              <p className="text-xs text-accent-orange mt-1">{cityWarning}</p>
            )}
            {showCitySuggestions && citySuggestions.length > 0 && (
              <div
                className={cn(
                  "absolute z-50 left-0 right-0 mt-1",
                  "bg-secondary/95 backdrop-blur-xl",
                  "border border-glass-subtle shadow-modal",
                  "rounded-xl max-h-48 overflow-y-auto"
                )}
              >
                {citySuggestions.map((city) => (
                  <button
                    key={city}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/[0.08] transition-colors"
                    onMouseDown={() => handleCitySelect(city)}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-white/60">Описание</label>
              <DescriptionTemplateButton
                category={editForm.category}
                currentValue={editForm.description ?? ""}
                onInsert={(t) => setEditForm({ ...editForm, description: t })}
              />
            </div>
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-glass text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-accent-blue resize-none"
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Закупка (средняя по партиям)"
              type="number"
              value={editForm.purchasePrice}
              disabled
              readOnly
              rightIcon={<span className="text-white/40">₽</span>}
            />
            <div>
              <Input
                label="Дроп-цена"
                type="number"
                value={editForm.dropPrice}
                onChange={(e) => setEditForm({ ...editForm, dropPrice: e.target.value })}
                rightIcon={<span className="text-white/40">₽</span>}
              />
            </div>
            <Input
              label="Рекомендуемая"
              type="number"
              value={editForm.recommendedPrice}
              onChange={(e) => setEditForm({ ...editForm, recommendedPrice: e.target.value })}
              rightIcon={<span className="text-white/40">₽</span>}
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
                checked={editForm.isPremium}
                onChange={(e) => setEditForm({ ...editForm, isPremium: e.target.checked })}
              />
              <span className="text-white/80">Premium</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
              />
              <span className="text-white/80">Активный</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
                checked={editForm.isInStock}
                onChange={(e) => setEditForm({ ...editForm, isInStock: e.target.checked })}
              />
              <span className="text-white/80">В наличии</span>
            </label>
          </div>
          <p className="text-2xs text-white/40 leading-snug">
            База пересчитывает этот флаг автоматически при изменении остатков по размерам.
            Поставленное вручную значение действует до следующей продажи или правки размеров.
          </p>

          {!editForm.isInStock && (
            <Input
              label="Ожидаемая дата прибытия"
              type="date"
              value={editForm.expectedArrivalDate}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  expectedArrivalDate: e.target.value,
                })
              }
            />
          )}

          {/* Размеры (структура) + замеры — категория-зависимо (§11.6).
              Количество/закупка — ниже, в «Партиях». */}
          <div className="border-t border-glass pt-4">
            <p className="text-sm font-medium text-white/80 mb-1">Размеры и замеры</p>
            <p className="text-xs text-white/40 mb-3">
              Набор размеров и поля замеров подстроены под категорию. Количество и закупочная цена —
              ниже, в разделе «Партии закупок».
            </p>
            <ProductSizesEditor
              category={editForm.category}
              value={editForm.sizes.map((s) => ({
                size: s.size,
                measurements: s.measurements ?? {},
              }))}
              onChange={(next) =>
                setEditForm({
                  ...editForm,
                  sizes: next.map((r) => ({ size: r.size, measurements: r.measurements })),
                })
              }
            />
          </div>

          {/* Партии закупок + Поправить остаток (§11.5) */}
          <div className="border-t border-glass pt-4">
            <ProductBatchesEditor
              productId={productId}
              sizes={product.sizes.map((s) => ({
                id: s.id,
                size: s.size,
                currentQuantity: s.currentQuantity,
              }))}
              batches={batches}
            />
          </div>

          {/* Лестница партнёров */}
          <div className="border-t border-glass pt-4">
            <PartnerLadderEditor
              availableSizes={
                editForm.sizes.length > 0 ? editForm.sizes.map((s) => s.size) : ["One Size"]
              }
              bindings={editBindings}
              partners={partners}
              onChange={setEditBindings}
            />
          </div>

          {updateProduct.isError && (
            <p className="text-sm text-accent-red">
              {updateProduct.error instanceof Error
                ? updateProduct.error.message
                : "Ошибка обновления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowEditModal(false)}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              isLoading={updateProduct.isPending}
              disabled={!editForm.locationCity.trim() || !editForm.name.trim()}
              className="flex-1"
            >
              Сохранить
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Удалить товар?"
      >
        <div className="space-y-4">
          <p className="text-white/80">
            Вы уверены, что хотите удалить товар{" "}
            <span className="text-white font-medium">{product.name}</span>? Это действие нельзя
            отменить.
          </p>

          {deleteProduct.isError && (
            <p className="text-sm text-accent-red">
              {deleteProduct.error instanceof Error
                ? deleteProduct.error.message
                : "Ошибка удаления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowDeleteModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              variant="danger"
              isLoading={deleteProduct.isPending}
              onClick={handleDelete}
              className="flex-1"
            >
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      <CatalogPublishModal
        product={{
          id: product.id,
          name: product.name,
          dropPrice: product.dropPrice,
          recommendedPrice: product.recommendedPrice,
          description: product.description,
          photoUrls: product.photoUrls,
          sizes: product.sizes.map((s) => ({
            size: s.size,
            currentQuantity: s.currentQuantity,
          })),
        }}
        isOpen={showCatalogPublishModal}
        onClose={() => setShowCatalogPublishModal(false)}
      />
    </div>
  );
}

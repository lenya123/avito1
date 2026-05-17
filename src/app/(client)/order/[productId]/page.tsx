"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { v4 as uuidv4 } from "uuid";
import { useAuth, useBalance, useUserLevel } from "@/hooks/use-auth";
import { useProduct } from "@/hooks/use-products";
import { useCreateOrder, useCreateReservation, useDailyOrderLimit } from "@/hooks/use-orders";
import { calculatePriceBreakdown } from "@/utils/pricing";
import { sizeOrder } from "@/utils/sizes";
import { cn } from "@/utils/cn";
import { SizeSelector, PriceBreakdown, type SizeOption } from "@/components/client";
import { Button, Input, Spinner, ErrorState, DatePicker, BarcodeDisplay } from "@/components/ui";

type OrderStep = "details" | "confirm" | "success";

// Delivery service icons - simple universal delivery icons
const DeliveryIcons = {
  // Грузовик
  avito: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path
        d="M16 3H1V16H16V3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(2, 2) scale(0.85)"
      />
      <path
        d="M16 8H20L23 11V16H16V8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(2, 2) scale(0.85)"
      />
      <circle cx="7.5" cy="18.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18.5" cy="18.5" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  // Коробка с галочкой
  cdek: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path
        d="M21 8V21H3V8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 3H1V8H23V3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  // Коробка-посылка (Lucide package-2 style)
  yandex: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path
        d="M12 3V9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.76 3C17.5 3 18.17 3.42 18.56 4.1L20.79 8.58C20.93 8.85 21 9.16 21 9.47V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V9.47C3 9.16 3.07 8.85 3.21 8.58L5.44 4.1C5.83 3.42 6.5 3 7.24 3H16.76Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 9H21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  // Конверт
  pochta: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M22 6L12 13L2 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  // Цифра 5 в круге
  "5post": () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 7H15M9 7V11.5H13C14.3807 11.5 15.5 12.6193 15.5 14C15.5 15.3807 14.3807 16.5 13 16.5H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

const DELIVERY_SERVICES = [
  { value: "avito", label: "Avito Доставка" },
  { value: "cdek", label: "СДЭК" },
  { value: "yandex", label: "Яндекс Доставка" },
  { value: "pochta", label: "Почта России" },
  { value: "5post", label: "5Post" },
] as const;

// Step indicator component - iOS 26 Liquid Glass Style
function StepIndicator({ currentStep }: { currentStep: OrderStep }) {
  const steps = [
    { key: "details", label: "Детали", number: 1 },
    { key: "confirm", label: "Оплата", number: 2 },
    { key: "success", label: "Готово", number: 3 },
  ] as const;

  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {steps.map((step, index) => {
        const isActive = step.key === currentStep;
        const isCompleted = index < currentIndex;
        const isSuccessStep = step.key === "success" && isActive;

        return (
          <div key={step.key} className="flex items-center">
            <motion.div
              initial={false}
              animate={{
                scale: isActive ? 1 : 0.9,
              }}
              className={cn(
                "relative flex items-center gap-2 px-3.5 py-2 rounded-2xl",
                "border backdrop-blur-sm transition-all duration-300",
                "shadow-glass-inset",
                isCompleted || isSuccessStep
                  ? "bg-gradient-to-b from-accent-green/20 to-accent-green/10 border-accent-green/30"
                  : isActive
                    ? "bg-gradient-to-b from-accent-orange/20 to-accent-orange/10 border-accent-orange/30"
                    : "bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-glass-subtle"
              )}
            >
              {/* Glass bubble number/check */}
              <div
                className={cn(
                  "relative w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  "shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.2)]",
                  isCompleted || isSuccessStep
                    ? "bg-gradient-to-b from-[#40E168] to-accent-green text-white"
                    : isActive
                      ? "bg-gradient-to-b from-[#FFB020] to-accent-orange text-white"
                      : "bg-gradient-to-b from-white/15 to-white/5 text-white/40"
                )}
              >
                {isCompleted || isSuccessStep ? (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-semibold transition-colors tracking-wide",
                  isCompleted || isSuccessStep
                    ? "text-accent-green"
                    : isActive
                      ? "text-accent-orange"
                      : "text-white/40"
                )}
              >
                {step.label}
              </span>
            </motion.div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "w-5 h-[2px] mx-1 rounded-full transition-colors duration-300",
                  index < currentIndex
                    ? "bg-gradient-to-r from-accent-green/60 to-accent-green/30"
                    : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Glass section component - iOS 26 Liquid Glass Style
function GlassSection({
  children,
  className,
  title,
  icon,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={cn(
        "p-4 rounded-2xl",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      {title && (
        <div className="flex items-center gap-2.5 mb-4">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="text-sm font-semibold text-white/80 tracking-wide uppercase">{title}</h3>
        </div>
      )}
      {children}
    </motion.div>
  );
}

// Delivery service selector
function DeliveryServiceSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {DELIVERY_SERVICES.map((service) => {
        const isSelected = value === service.value;
        return (
          <motion.button
            key={service.value}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(service.value)}
            className={cn(
              "flex flex-col items-center gap-1.5 p-3 rounded-xl",
              "backdrop-blur-sm border transition-all duration-200",
              "shadow-glass-inset",
              isSelected
                ? [
                    // Выбранный - стеклянный стиль (как фильтры в каталоге)
                    "bg-white/[0.18] border-glass-strong",
                    "shadow-card",
                  ]
                : [
                    // Невыбранный - стеклянный стиль (как фильтры в каталоге)
                    "bg-white/[0.08] text-white/60 border-glass",
                    "hover:text-white hover:bg-white/[0.12] hover:border-white/25",
                  ]
            )}
          >
            <span className={cn("transition-colors", isSelected ? "text-white" : "text-white/60")}>
              {DeliveryIcons[service.value as keyof typeof DeliveryIcons]()}
            </span>
            <span
              className={cn(
                "text-xs font-medium text-center leading-tight",
                isSelected ? "text-white" : "text-white/60"
              )}
            >
              {service.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

export default function OrderPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.productId as string;

  const { user } = useAuth();
  const { deposit, referralDeposit, total: totalBalance } = useBalance();
  const { discountPercent, isVibePlus } = useUserLevel();

  // Data fetching
  const {
    data: productData,
    isLoading: productLoading,
    error: productError,
  } = useProduct(productId);

  // Mutations
  const createOrder = useCreateOrder();
  const createReservation = useCreateReservation();

  // Daily order limit
  const orderLimit = useDailyOrderLimit();

  // Form state
  const [step, setStep] = useState<OrderStep>("details");
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [deliveryService, setDeliveryService] = useState("avito");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [salePrice, setSalePrice] = useState<string>("");
  const [comment, setComment] = useState("");
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [reservationExpires, setReservationExpires] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Уникальный ID вкладки - создаётся один раз при загрузке страницы
  const tabSessionId = useRef<string>(uuidv4());

  // Derived state
  const product = productData?.product;
  const isFirstOrder = user ? !user.firstOrderDiscountUsed : false;
  const vibeLimit = user?.depositLimit || 0;

  // Calculate sizes with availability, sorted from smallest to largest
  // Используем sizesWithAvailability из API — там уже учтены резервы
  const sizeOptions: SizeOption[] = useMemo(() => {
    if (!product?.sizesWithAvailability) return [];

    return product.sizesWithAvailability
      .map((s) => ({
        id: s.id,
        size: s.size,
        available: s.available,
      }))
      .sort((a, b) => {
        const indexA = sizeOrder.indexOf(a.size.toUpperCase());
        const indexB = sizeOrder.indexOf(b.size.toUpperCase());
        if (indexA === -1 && indexB === -1) return a.size.localeCompare(b.size);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
  }, [product?.sizesWithAvailability]);

  const hasSizes = sizeOptions.length > 0;

  // Calculate pricing
  const pricing = useMemo(() => {
    if (!product) return null;
    return calculatePriceBreakdown({
      dropPrice: product.drop_price,
      discountPercent: isVibePlus ? 10 : discountPercent,
      isFirstOrder,
    });
  }, [product, discountPercent, isVibePlus, isFirstOrder]);

  // Timer for reservation
  useEffect(() => {
    // Не запускаем таймер если заказ уже оформлен
    if (!reservationExpires || step === "success") return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.max(0, Math.floor((reservationExpires.getTime() - now.getTime()) / 1000));
      setTimeLeft(diff);

      if (diff === 0) {
        // Reservation expired - delete it on server via sendBeacon
        if (reservationId) {
          navigator.sendBeacon("/api/reservations/cleanup", JSON.stringify({ reservationId }));
        }
        setReservationId(null);
        setReservationExpires(null);
        setSelectedSizeId(null);
        setSelectedSize(null);
        router.push("/catalog");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [reservationExpires, reservationId, router, step]);

  // Cleanup reservation when leaving page
  // НЕ используем visibilitychange — он срабатывает при переключении вкладок!
  useEffect(() => {
    const currentReservationId = reservationId;
    let cleanupSent = false;

    const sendCleanup = () => {
      if (currentReservationId && !cleanupSent) {
        cleanupSent = true;
        navigator.sendBeacon(
          "/api/reservations/cleanup",
          JSON.stringify({ reservationId: currentReservationId })
        );
      }
    };

    // pagehide - самый надёжный для закрытия вкладки (особенно на мобильных)
    const handlePageHide = (e: PageTransitionEvent) => {
      // persisted = true означает bfcache, не очищаем
      if (!e.persisted) {
        sendCleanup();
      }
    };

    // beforeunload - для десктопных браузеров
    const handleBeforeUnload = () => {
      sendCleanup();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Cleanup при unmount (навигация внутри SPA)
      sendCleanup();
    };
  }, [reservationId]);

  // Auto-reservation for products without sizes
  useEffect(() => {
    if (!product || hasSizes || reservationId || createReservation.isPending) return;

    createReservation.mutate(
      { productId, sessionId: tabSessionId.current },
      {
        onSuccess: (result) => {
          setReservationId(result.reservation.id);
          setReservationExpires(new Date(result.expiresAt));
        },
        onError: (error) => {
          console.error("Product reservation failed:", error);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, hasSizes]);

  // Handlers
  const handleSizeSelect = useCallback(
    (sizeId: string, size: string) => {
      // Не обновляем резерв если тот же размер уже выбран — таймер не должен сбрасываться
      if (sizeId === selectedSizeId) return;

      // Optimistic update - immediately show selected size
      setSelectedSizeId(sizeId);
      setSelectedSize(size);

      // Create new reservation (API will handle removing old reservation for this tab via sessionId)
      createReservation.mutate(
        { productSizeId: sizeId, sessionId: tabSessionId.current },
        {
          onSuccess: (result) => {
            setReservationId(result.reservation.id);
            setReservationExpires(new Date(result.expiresAt));
          },
          onError: (error) => {
            console.error("Reservation failed:", error);
            // Rollback optimistic update on error
            setSelectedSizeId(null);
            setSelectedSize(null);
          },
        }
      );
    },
    [createReservation, selectedSizeId]
  );

  const handleContinue = useCallback(() => {
    if ((hasSizes && !selectedSizeId) || !trackingNumber || !deliveryDeadline || !salePrice) return;
    setStep("confirm");
  }, [hasSizes, selectedSizeId, trackingNumber, deliveryDeadline, salePrice]);

  const handleBack = useCallback(() => {
    setStep("details");
  }, []);

  // Парсинг даты из формата dd.mm.yyyy
  // Устанавливаем время на 12:00 чтобы избежать проблем с таймзонами при конвертации в UTC
  const parseDeadlineDate = (dateStr: string): Date | null => {
    const parts = dateStr.split(".");
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day, 12, 0, 0);
  };

  const handleConfirm = useCallback(async () => {
    if (
      (hasSizes && (!selectedSizeId || !selectedSize)) ||
      !trackingNumber ||
      !deliveryDeadline ||
      !salePrice ||
      !pricing
    )
      return;

    const deadlineDate = parseDeadlineDate(deliveryDeadline);
    if (!deadlineDate) return;

    // Сохраняем reservationId для передачи в API
    const currentReservationId = reservationId;

    // Очищаем reservationId ДО вызова API, чтобы cleanup effect не сработал
    // (API сам удалит резерв из БД)
    setReservationId(null);
    setReservationExpires(null);

    try {
      await createOrder.mutateAsync({
        productId,
        productSizeId: selectedSizeId || undefined,
        size: selectedSize || undefined,
        deliveryService: deliveryService as "avito" | "yandex" | "cdek" | "pochta" | "5post",
        trackingNumber,
        deliveryDeadline: deadlineDate.toISOString(),
        salePrice: salePrice ? parseFloat(salePrice) : undefined,
        comment: comment || undefined,
        reservationId: currentReservationId || undefined,
      });
      setStep("success");
    } catch (error) {
      console.error("Order creation failed:", error);
      // При ошибке восстанавливаем reservationId (если резерв ещё активен на сервере)
      // Но лучше перенаправить пользователя обратно в каталог
    }
  }, [
    hasSizes,
    selectedSizeId,
    selectedSize,
    trackingNumber,
    deliveryDeadline,
    deliveryService,
    salePrice,
    comment,
    reservationId,
    productId,
    pricing,
    createOrder,
  ]);

  // Form validation
  const isStep1Valid =
    (hasSizes ? selectedSizeId : true) && trackingNumber && deliveryDeadline && salePrice;
  const hasEnoughBalance =
    pricing &&
    (totalBalance >= pricing.finalPrice ||
      (isVibePlus && totalBalance + vibeLimit >= pricing.finalPrice));
  const canOrder = hasEnoughBalance && orderLimit.canOrder;

  // Loading state
  if (productLoading) {
    return (
      <main className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </main>
    );
  }

  // Error state
  if (productError || !product) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <ErrorState message="Товар не найден" onRetry={() => router.push("/catalog")} />
      </main>
    );
  }

  // Format time left
  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Step indicator */}
      <StepIndicator currentStep={step} />

      {/* Timer */}
      {reservationExpires && timeLeft > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mb-5 p-3 rounded-xl flex items-center justify-between",
            "bg-accent-orange/10 border border-accent-orange/20",
            "backdrop-blur-sm"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-orange animate-pulse" />
            <span className="text-sm text-accent-orange font-medium">
              {hasSizes ? "Размер зарезервирован" : "Товар зарезервирован"}
            </span>
          </div>
          <span className="text-lg font-bold text-accent-orange tabular-nums">
            {formatTimeLeft(timeLeft)}
          </span>
        </motion.div>
      )}

      {/* Daily order limit indicator for Basic users */}
      {!orderLimit.isLoading && !orderLimit.hasUnlimitedOrders && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mb-5 p-3 rounded-xl flex items-center justify-between",
            orderLimit.canOrder
              ? "bg-white/[0.06] border border-glass"
              : "bg-accent-red/10 border border-accent-red/20",
            "backdrop-blur-sm"
          )}
        >
          <div className="flex items-center gap-2">
            <svg
              className={cn("w-4 h-4", orderLimit.canOrder ? "text-white/40" : "text-accent-red")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span
              className={cn(
                "text-sm font-medium",
                orderLimit.canOrder ? "text-white/60" : "text-accent-red"
              )}
            >
              {orderLimit.canOrder
                ? `Осталось ${orderLimit.remaining} ${orderLimit.remaining === 1 ? "заказ" : orderLimit.remaining >= 2 && orderLimit.remaining <= 4 ? "заказа" : "заказов"} сегодня`
                : "Лимит заказов на сегодня исчерпан"}
            </span>
          </div>
          {!orderLimit.canOrder && (
            <button
              onClick={() => router.push("/profile/subscription")}
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-xl",
                "bg-accent-blue/20 text-accent-blue",
                "hover:bg-accent-blue/30 transition-colors"
              )}
            >
              Premium
            </button>
          )}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {/* Step 1: Details */}
        {step === "details" && (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Product info - Hero card */}
            <GlassSection className="overflow-hidden" delay={0}>
              <div className="flex gap-4">
                {product.photo_urls && product.photo_urls[0] && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="relative w-28 h-28 rounded-xl overflow-hidden bg-white/10 flex-shrink-0 ring-1 ring-white/10"
                  >
                    <Image
                      src={product.photo_urls[0]}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  </motion.div>
                )}
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    {product.brand && (
                      <p className="text-xs text-white/40 uppercase tracking-wider font-medium mb-1">
                        {product.brand}
                      </p>
                    )}
                    <h1 className="text-lg font-semibold text-white leading-snug">
                      {product.name}
                    </h1>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">К оплате</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-lg font-bold text-white">
                        {pricing
                          ? pricing.finalPrice.toLocaleString("ru-RU")
                          : product.drop_price.toLocaleString("ru-RU")}
                        <span className="text-sm font-medium text-white/60 ml-0.5">₽</span>
                      </p>
                      {pricing && pricing.totalDiscount > 0 && (
                        <>
                          <span className="text-white/20 line-through text-xs">
                            {product.drop_price.toLocaleString("ru-RU")} ₽
                          </span>
                          <div className="flex items-center gap-1">
                            {pricing.levelDiscountPercent > 0 && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-2xs font-semibold",
                                  "bg-white/[0.08] text-white",
                                  "border border-glass-active"
                                )}
                              >
                                -{pricing.levelDiscountPercent}%
                              </span>
                            )}
                            {pricing.firstOrderDiscount > 0 && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-2xs font-semibold",
                                  "bg-white/[0.08] text-white",
                                  "border border-glass-active"
                                )}
                              >
                                -500 ₽
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </GlassSection>

            {/* Size selector (hidden for products without sizes) */}
            {hasSizes && (
              <GlassSection title="Размер" icon="📏" delay={0.05}>
                <SizeSelector
                  sizes={sizeOptions}
                  selectedSizeId={selectedSizeId}
                  onSelect={handleSizeSelect}
                  disabled={createReservation.isPending}
                />
                {createReservation.isError && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 text-sm text-accent-red flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {createReservation.error?.message || "Ошибка резервирования. Попробуйте снова."}
                  </motion.p>
                )}
              </GlassSection>
            )}

            {/* Delivery service */}
            <GlassSection title="Доставка" icon="🚚" delay={0.1}>
              <DeliveryServiceSelector value={deliveryService} onChange={setDeliveryService} />

              <div className="mt-4">
                <Input
                  label="Трек-номер"
                  placeholder="Номер заказа в системе ПВЗ"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  required
                  rightIcon={
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) setTrackingNumber(text.trim());
                        } catch {
                          // Clipboard access denied
                        }
                      }}
                      className="flex items-center justify-center hover:text-white/60 active:scale-95 transition-all"
                      title="Вставить из буфера"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    </button>
                  }
                />
              </div>

              {trackingNumber.length >= 3 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4"
                >
                  <BarcodeDisplay value={trackingNumber} height={60} />
                </motion.div>
              )}

              <div className="mt-4">
                <DatePicker
                  label="Дедлайн отправки"
                  value={deliveryDeadline}
                  onChange={setDeliveryDeadline}
                  minDate={(() => {
                    // Проверяем время по МСК (UTC+3)
                    const now = new Date();
                    const mskHour = (now.getUTCHours() + 3) % 24;
                    // Если до 17:00 МСК - можно сегодня, иначе завтра
                    if (mskHour < 17) {
                      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    }
                    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                  })()}
                  placeholder="Выберите дату"
                />
              </div>
            </GlassSection>

            {/* Sale price */}
            <GlassSection title="Цена продажи" icon="💵" delay={0.2}>
              <Input
                type="number"
                placeholder="За сколько продаёте?"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
              />
              <p className="mt-2 ml-1 text-xs text-white/40">
                Необходимо для подсчёта вашей статистики
              </p>
            </GlassSection>

            {/* Additional options */}
            <GlassSection title="Дополнительно" icon="✨" delay={0.25}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">
                    Комментарий
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Любые пожелания к заказу..."
                    maxLength={60}
                    rows={3}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl resize-none",
                      "bg-white/[0.06] border border-glass-minimal",
                      "text-white placeholder:text-white/20",
                      "focus:outline-none focus:border-accent-blue/50 focus:ring-2 focus:ring-accent-blue/10",
                      "transition-all duration-200"
                    )}
                  />
                  <p className="mt-1.5 text-xs text-white/40 text-right">{comment.length}/60</p>
                </div>
              </div>
            </GlassSection>

            {/* Continue button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Button
                variant="primary"
                onClick={handleContinue}
                disabled={!isStep1Valid}
                className="w-full h-12 rounded-xl text-base"
              >
                Продолжить
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* Step 2: Confirm */}
        {step === "confirm" && pricing && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Order summary */}
            <GlassSection title="Детали заказа" icon="📋" delay={0}>
              <div className="space-y-3">
                {/* Product mini card */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  {product.photo_urls && product.photo_urls[0] && (
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white/10 flex-shrink-0">
                      <Image
                        src={product.photo_urls[0]}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{product.name}</p>
                    <p className="text-xs text-white/40">{product.brand}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">
                      {pricing.finalPrice.toLocaleString("ru-RU")} ₽
                    </p>
                  </div>
                </div>

                {/* Details grid */}
                <div className={cn("grid gap-3", selectedSize ? "grid-cols-2" : "grid-cols-1")}>
                  {selectedSize && (
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-xs text-white/40 mb-1">Размер</p>
                      <p className="text-sm font-medium text-white">{selectedSize}</p>
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-xs text-white/40 mb-1">Дедлайн</p>
                    <p className="text-sm font-medium text-white">{deliveryDeadline}</p>
                  </div>
                </div>

                {/* Delivery info */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-white/80">
                    {DeliveryIcons[deliveryService as keyof typeof DeliveryIcons]?.()}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs text-white/40">Служба доставки</p>
                    <p className="text-sm font-medium text-white">
                      {DELIVERY_SERVICES.find((s) => s.value === deliveryService)?.label}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40">Трек-номер</p>
                    <p className="text-sm font-medium text-white">{trackingNumber}</p>
                  </div>
                </div>

                {salePrice && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                    <span className="text-xs text-white/40">Цена продажи</span>
                    <span className="text-sm font-medium text-white">
                      {parseFloat(salePrice).toLocaleString("ru-RU")} ₽
                    </span>
                  </div>
                )}
              </div>
            </GlassSection>

            {/* Price breakdown */}
            <GlassSection title="Расчёт стоимости" icon="💰" delay={0.05}>
              <PriceBreakdown
                pricing={pricing}
                balance={{ deposit, referralDeposit }}
                isVibePlus={isVibePlus}
                vibeLimit={vibeLimit}
              />
            </GlassSection>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex gap-3"
            >
              <button
                onClick={handleBack}
                className={cn(
                  "flex-1 h-12 rounded-xl font-semibold text-base",
                  "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
                  "text-white/80",
                  "border border-glass-subtle",
                  "shadow-card",
                  "transition-all duration-200",
                  "hover:from-white/[0.16] hover:to-white/[0.08] hover:text-white",
                  "active:scale-[0.98]"
                )}
              >
                Назад
              </button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={!canOrder}
                isLoading={createOrder.isPending}
                className="flex-1 h-12 rounded-xl text-base"
              >
                Оформить заказ
              </Button>
            </motion.div>

            {createOrder.isError && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-accent-red/10 border border-accent-red/20 flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5 text-accent-red flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-accent-red">Ошибка создания заказа. Попробуйте снова.</p>
              </motion.div>
            )}

            {/* Order limit warning */}
            {!orderLimit.hasUnlimitedOrders && !orderLimit.canOrder && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-accent-orange/10 border border-accent-orange/20 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-accent-orange flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p className="text-sm text-accent-orange">Лимит заказов на сегодня исчерпан</p>
                </div>
                <button
                  onClick={() => router.push("/profile/subscription")}
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-xl",
                    "bg-accent-blue/20 text-accent-blue",
                    "hover:bg-accent-blue/30 transition-colors"
                  )}
                >
                  Premium
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Step 3: Success */}
        {step === "success" && createOrder.data && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <GlassSection className="text-center py-8">
              {/* Success emoji - clean Apple style */}
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.1,
                  type: "spring",
                  stiffness: 260,
                  damping: 20,
                }}
                className="block text-7xl mb-6"
              >
                🏆
              </motion.span>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h2 className="text-2xl font-bold text-white mb-2">Заказ оформлен!</h2>
                <p className="text-4xl font-bold text-white/80 mb-1">
                  #{createOrder.data.order.order_number}
                </p>
                <p className="text-white/40">Мы отправим его в ближайшее время</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex flex-col gap-3 mt-8"
              >
                <Button
                  variant="primary"
                  onClick={() => router.push("/stats")}
                  className="w-full h-12 rounded-xl text-base"
                >
                  Мои заказы
                </Button>
                <button
                  onClick={() => router.push("/catalog")}
                  className={cn(
                    "w-full h-12 rounded-xl font-semibold text-base",
                    "bg-[rgba(50,50,50,0.9)]",
                    "text-white/80",
                    "border border-glass-active",
                    "shadow-card",
                    "transition-all duration-200",
                    "hover:bg-[rgba(60,60,60,0.95)] hover:text-white hover:border-white/30",
                    "hover:shadow-card-hover",
                    "active:scale-[0.98]"
                  )}
                >
                  Вернуться в каталог
                </button>
              </motion.div>
            </GlassSection>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

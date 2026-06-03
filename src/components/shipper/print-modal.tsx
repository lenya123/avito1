"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Modal, ModalFooter, Button, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import { type ShipperOrder, DELIVERY_SERVICE_LABELS } from "@/hooks/use-shipper-orders";
import {
  usePrinterStore,
  useLabelConfig,
  useSavedPrinter,
  usePrinterType,
} from "@/stores/printer-store";
import { usePlatformDetect } from "@/hooks/use-platform";
import {
  generateLabel,
  generateLabelCanvas,
  orderToLabelData,
  type LabelConfig,
} from "./label-generator";
import { getPrinterDriver } from "./printer-driver";
import { shareLabels, downloadLabels, canShareFiles } from "./label-share";

type PrintState = "preview" | "connecting" | "printing" | "sharing" | "done" | "error";

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: ShipperOrder[];
  onPrintComplete: (orderIds: string[]) => void;
}

export function PrintModal({ isOpen, onClose, orders, onPrintComplete }: PrintModalProps) {
  const [state, setState] = useState<PrintState>("preview");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const labelConfig = useLabelConfig();
  const savedPrinter = useSavedPrinter();
  const printerType = usePrinterType();
  const { bluetooth } = usePlatformDetect();
  const generatedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPreviews([]);
      generatedRef.current = false;
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Generate preview images when modal opens
  useEffect(() => {
    if (!isOpen || orders.length === 0) return;
    if (generatedRef.current) return;
    generatedRef.current = true;

    const config: LabelConfig = {
      widthMm: labelConfig.widthMm,
      heightMm: labelConfig.heightMm,
      dpi: labelConfig.dpi,
    };

    const urls: string[] = [];
    Promise.all(
      orders.map(async (order) => {
        const blob = await generateLabel(orderToLabelData(order), config);
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return url;
      })
    )
      .then(setPreviews)
      .catch(() => {
        // Revoke any URLs created before the failure
        urls.forEach(URL.revokeObjectURL);
      });
  }, [isOpen, orders, labelConfig]);

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      previews.forEach(URL.revokeObjectURL);
    };
  }, [previews]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setState("preview");
      setProgress({ current: 0, total: 0 });
      setError(null);
    }
  }, [isOpen]);

  // Snap scroll to detect active slide
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const slideWidth = el.offsetWidth;
    const index = Math.round(scrollLeft / slideWidth);
    setActiveIndex(Math.min(index, previews.length - 1));
  }, [previews.length]);

  // Navigate to specific slide
  const goToSlide = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.offsetWidth, behavior: "smooth" });
    setActiveIndex(index);
  }, []);

  // --- Print via BLE (ESC/POS or Niimbot) ---
  const handleDirectPrint = useCallback(async () => {
    const config: LabelConfig = {
      widthMm: labelConfig.widthMm,
      heightMm: labelConfig.heightMm,
      dpi: labelConfig.dpi,
    };

    try {
      const printer = getPrinterDriver(printerType);

      if (!printer.isConnected) {
        setState("connecting");
        const info = await printer.connect();
        usePrinterStore.getState().setSavedPrinter(info);
      }

      setState("printing");
      setProgress({ current: 0, total: orders.length });

      const canvases = await Promise.all(
        orders.map((order) => generateLabelCanvas(orderToLabelData(order), config))
      );

      // Race print against a 90s timeout to avoid stuck "printing" state
      const PRINT_TIMEOUT = 90_000;
      const printPromise = printer.printBatch(canvases, (current, total) => {
        setProgress({ current, total });
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Печать зависла — принтер не отвечает")), PRINT_TIMEOUT)
      );

      await Promise.race([printPromise, timeoutPromise]);

      setState("done");
      onPrintComplete(orders.map((o) => o.id));
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Ошибка печати");
    }
  }, [orders, labelConfig, printerType, onPrintComplete]);

  // --- Share labels (iOS) ---
  const handleShareLabels = useCallback(async () => {
    const config: LabelConfig = {
      widthMm: labelConfig.widthMm,
      heightMm: labelConfig.heightMm,
      dpi: labelConfig.dpi,
    };

    try {
      setState("sharing");
      setProgress({ current: 0, total: orders.length });

      const blobs = await Promise.all(
        orders.map(async (order, i) => {
          setProgress({ current: i + 1, total: orders.length });
          return generateLabel(orderToLabelData(order), config);
        })
      );

      const filenames = orders.map((o) => `label-${o.order_number}.png`);

      if (canShareFiles()) {
        await shareLabels(blobs, filenames);
      } else {
        await downloadLabels(blobs, filenames);
      }

      setState("done");
      onPrintComplete(orders.map((o) => o.id));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setState("preview");
        return;
      }
      setState("error");
      setError(err instanceof Error ? err.message : "Ошибка экспорта");
    }
  }, [orders, labelConfig, onPrintComplete]);

  // --- Download fallback ---
  const handleDownload = useCallback(async () => {
    const config: LabelConfig = {
      widthMm: labelConfig.widthMm,
      heightMm: labelConfig.heightMm,
      dpi: labelConfig.dpi,
    };

    try {
      setState("sharing");
      const blobs = await Promise.all(
        orders.map((order) => generateLabel(orderToLabelData(order), config))
      );
      const filenames = orders.map((o) => `label-${o.order_number}.png`);
      await downloadLabels(blobs, filenames);
      setState("done");
      onPrintComplete(orders.map((o) => o.id));
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Ошибка скачивания");
    }
  }, [orders, labelConfig, onPrintComplete]);

  const hasBluetooth = bluetooth;
  const isProcessing = state === "connecting" || state === "printing" || state === "sharing";
  const activeOrder = orders[activeIndex];

  return (
    <Modal
      isOpen={isOpen}
      onClose={isProcessing ? () => {} : onClose}
      title={`Печать (${orders.length} шт.)`}
      size="lg"
      closeOnBackdrop={!isProcessing}
    >
      <div className="overflow-hidden">
        {/* ── Full-size carousel preview ─────────────────────── */}
        {state === "preview" && previews.length > 0 && (
          <div className="space-y-3">
            {/* Carousel */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className={cn(
                "flex overflow-x-auto snap-x snap-mandatory",
                "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]",
                "[&::-webkit-scrollbar]:hidden"
              )}
              style={{ scrollSnapType: "x mandatory" }}
            >
              {previews.map((url, i) => (
                <div key={orders[i]?.id || i} className="w-full flex-shrink-0 snap-center px-1">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03, duration: 0.25 }}
                    className={cn(
                      "rounded-2xl overflow-hidden",
                      "border border-white/10",
                      "bg-white",
                      "shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Этикетка #${orders[i]?.order_number}`}
                      className="w-full h-auto block"
                      draggable={false}
                    />
                  </motion.div>
                </div>
              ))}
            </div>

            {/* Dots + counter */}
            {orders.length > 1 && (
              <div className="flex items-center justify-center gap-3">
                {/* Prev arrow */}
                <button
                  onClick={() => goToSlide(Math.max(0, activeIndex - 1))}
                  disabled={activeIndex === 0}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    activeIndex === 0
                      ? "text-white/20 cursor-default"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  aria-label="Предыдущая"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                {/* Dots or counter */}
                {orders.length <= 6 ? (
                  <div className="flex items-center gap-1.5">
                    {orders.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goToSlide(i)}
                        className={cn(
                          "rounded-full transition-all duration-200",
                          i === activeIndex
                            ? "w-6 h-2 bg-accent-blue"
                            : "w-2 h-2 bg-white/25 hover:bg-white/40"
                        )}
                        aria-label={`Этикетка ${i + 1}`}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-white/50 tabular-nums min-w-[3rem] text-center">
                    {activeIndex + 1} / {orders.length}
                  </span>
                )}

                {/* Next arrow */}
                <button
                  onClick={() => goToSlide(Math.min(orders.length - 1, activeIndex + 1))}
                  disabled={activeIndex === orders.length - 1}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    activeIndex === orders.length - 1
                      ? "text-white/20 cursor-default"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  aria-label="Следующая"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            {/* Active label info */}
            {activeOrder && (
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "flex items-center justify-between",
                  "px-3 py-2 rounded-xl",
                  "bg-white/[0.04] border border-white/[0.06]"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-white">
                    #{activeOrder.order_number}
                  </span>
                  <span className="text-xs text-white/40 truncate">
                    {activeOrder.product?.name}
                  </span>
                </div>
                <span className="text-xs text-white/50 flex-shrink-0 ml-2">
                  {DELIVERY_SERVICE_LABELS[activeOrder.delivery_service] ||
                    activeOrder.delivery_service}
                  {activeOrder.size ? ` · ${activeOrder.size}` : ""}
                </span>
              </motion.div>
            )}
          </div>
        )}

        {/* Loading previews */}
        {state === "preview" && previews.length === 0 && orders.length > 0 && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
            <span className="ml-3 text-white/60">Генерация этикеток...</span>
          </div>
        )}

        {/* Connecting */}
        {state === "connecting" && (
          <div className="flex flex-col items-center justify-center py-16">
            <Spinner size="lg" />
            <p className="mt-4 text-white/80 font-medium">Подключение к принтеру...</p>
            {savedPrinter && <p className="text-sm text-white/50 mt-1">{savedPrinter.name}</p>}
          </div>
        )}

        {/* Printing / Sharing progress */}
        {(state === "printing" || state === "sharing") && (
          <div className="flex flex-col items-center justify-center py-16">
            <Spinner size="lg" />
            <p className="mt-4 text-white/80 font-medium">
              {state === "printing" ? "Печать" : "Подготовка"}...
            </p>
            <p className="text-sm text-white/50 mt-1">
              {progress.current} из {progress.total}
            </p>
            {state === "sharing" && !hasBluetooth && (
              <p className="text-xs text-white/30 mt-2">Выберите NIIMBOT в меню</p>
            )}
            <div className="w-full max-w-xs mt-4 bg-white/10 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-accent-blue rounded-full"
                initial={{ width: 0 }}
                animate={{
                  width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Done */}
        {state === "done" && (
          <div className="flex flex-col items-center justify-center py-16">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="w-16 h-16 rounded-full bg-accent-green/20 flex items-center justify-center mb-4"
            >
              <svg
                className="w-8 h-8 text-accent-green"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </motion.div>
            <p className="text-white font-medium">Готово!</p>
            <p className="text-sm text-white/50 mt-1">
              {orders.length} этикет{orders.length === 1 ? "ка" : orders.length < 5 ? "ки" : "ок"}{" "}
              {hasBluetooth ? "напечатано" : "отправлено на печать"}
            </p>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="flex flex-col items-center justify-center py-16">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 rounded-full bg-accent-red/20 flex items-center justify-center mb-4"
            >
              <svg
                className="w-8 h-8 text-accent-red"
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
            </motion.div>
            <p className="text-white font-medium">Ошибка</p>
            <p className="text-sm text-white/50 mt-1">{error}</p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <ModalFooter>
        {state === "preview" && (
          <>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={hasBluetooth ? handleDirectPrint : handleShareLabels}
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              Печать ({orders.length})
            </Button>

            <Button variant="secondary" size="lg" onClick={handleDownload}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setState("preview");
                setError(null);
              }}
            >
              Повторить
            </Button>
          </>
        )}

        {state === "done" && (
          <Button variant="primary" className="flex-1" onClick={onClose}>
            Готово
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

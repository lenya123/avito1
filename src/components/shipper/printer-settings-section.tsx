"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/utils/cn";
import {
  usePrinterStore,
  useSavedPrinter,
  useLabelConfig,
  usePrinterType,
} from "@/stores/printer-store";
import { usePlatformDetect } from "@/hooks/use-platform";
import { getPrinterDriver, type PrinterType, type PrinterBrand } from "./printer-driver";
import {
  generateLabel,
  generateLabelCanvas,
  type LabelConfig,
  type LabelData,
} from "./label-generator";
import { shareLabels, downloadLabels, canShareFiles } from "./label-share";

const PRINTER_TYPES: { value: PrinterType; label: string; desc: string }[] = [
  { value: "escpos", label: "ESC/POS", desc: "Phomemo, HPRT, Xprinter" },
  { value: "niimbot", label: "Niimbot", desc: "D11, B21, B1, B18" },
];

const BRAND_LABELS: Record<PrinterBrand, string> = {
  phomemo: "Phomemo",
  hprt: "HPRT",
  xprinter: "Xprinter",
  generic: "ESC/POS",
  niimbot: "Niimbot",
};

const DPI_OPTIONS = [
  { label: "203 DPI", desc: "Стандарт", value: 203 },
  { label: "300 DPI", desc: "Высокое", value: 300 },
] as const;

export function PrinterSettingsSection() {
  const savedPrinter = useSavedPrinter();
  const labelConfig = useLabelConfig();
  const printerType = usePrinterType();
  const store = usePrinterStore();
  const { bluetooth } = usePlatformDetect();
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasBluetooth = bluetooth;

  // Connect printer via Web Bluetooth
  const handleConnectPrinter = useCallback(async () => {
    setConnecting(true);
    try {
      const printer = getPrinterDriver(printerType);
      const info = await printer.connect();
      store.setSavedPrinter({ id: info.id, name: info.name, brand: info.brand });
    } catch (err) {
      if (err instanceof Error && err.name !== "NotFoundError") {
        alert(`Ошибка: ${err.message}`);
      }
    } finally {
      setConnecting(false);
    }
  }, [store, printerType]);

  // Disconnect printer
  const handleDisconnect = useCallback(async () => {
    const printer = getPrinterDriver(printerType);
    await printer.disconnect();
    store.setSavedPrinter(null);
  }, [store, printerType]);

  // Test print
  const handleTestPrint = useCallback(async () => {
    const testData: LabelData = {
      orderNumber: 9999,
      avitoOrderId: "TEST-123",
      trackingNumber: "1234567890",
      deliveryService: "cdek",
      productName: "Тестовый товар",
      size: "M",
    };

    const config: LabelConfig = {
      widthMm: labelConfig.widthMm,
      heightMm: labelConfig.heightMm,
      dpi: labelConfig.dpi,
    };

    setTesting(true);
    try {
      const printer = getPrinterDriver(printerType);

      if (printer.isConnected) {
        const canvas = await generateLabelCanvas(testData, config);
        await printer.printCanvas(canvas);
      } else {
        // Fallback: share/download
        const blob = await generateLabel(testData, config);
        if (canShareFiles()) {
          await shareLabels([blob], ["test-label.png"]);
        } else {
          await downloadLabels([blob], ["test-label.png"]);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        alert(`Ошибка: ${err.message}`);
      }
    } finally {
      setTesting(false);
    }
  }, [labelConfig, printerType]);

  return (
    <div className="space-y-4">
      {/* Printer type selection */}
      <div className="flex gap-2">
        {PRINTER_TYPES.map((pt) => (
          <button
            key={pt.value}
            type="button"
            onClick={() => store.setPrinterType(pt.value)}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-center transition-all duration-200",
              "border",
              printerType === pt.value
                ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue shadow-[0_0_8px_rgba(10,132,255,0.1)]"
                : "bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/[0.06]"
            )}
          >
            <p className="text-sm font-medium">{pt.label}</p>
            <p className="text-[10px] opacity-60 mt-0.5">{pt.desc}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
                  "border border-white/20",
                  "shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
                )}
              >
                <svg
                  className="w-5 h-5 text-white/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium text-sm">
                  {savedPrinter ? savedPrinter.name : "Принтер"}
                </p>
                <p className="text-xs text-white/50 flex items-center gap-1.5">
                  {savedPrinter && <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />}
                  {savedPrinter
                    ? `Подключён${savedPrinter.brand && savedPrinter.brand !== "generic" ? ` · ${BRAND_LABELS[savedPrinter.brand]}` : ""}`
                    : hasBluetooth
                      ? "Bluetooth термопринтер"
                      : "Откройте в Bluefy для подключения"}
                </p>
              </div>
            </div>

            {hasBluetooth && (
              <button
                type="button"
                onClick={savedPrinter ? handleDisconnect : handleConnectPrinter}
                disabled={connecting}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  savedPrinter
                    ? "text-accent-red/80 hover:bg-accent-red/10"
                    : "text-accent-blue hover:bg-accent-blue/10"
                )}
              >
                {connecting ? "..." : savedPrinter ? "Отключить" : "Подключить"}
              </button>
            )}
          </div>

          {/* Test print button */}
          <button
            type="button"
            onClick={handleTestPrint}
            disabled={testing}
            className={cn(
              "w-full mt-3 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.08]",
              testing && "opacity-50"
            )}
          >
            {testing ? "Печать..." : "Тестовая этикетка"}
          </button>
        </CardContent>
      </Card>

      {/* Advanced settings (DPI) */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors px-1"
        >
          <motion.svg
            initial={false}
            animate={{ rotate: showAdvanced ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
          Расширенные настройки
        </button>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="pt-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-white/40 mb-3">DPI принтера</p>
                    <div className="flex gap-2">
                      {DPI_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => store.setDpi(opt.value)}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl text-center transition-all duration-200",
                            "border",
                            labelConfig.dpi === opt.value
                              ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue shadow-[0_0_8px_rgba(10,132,255,0.1)]"
                              : "bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/[0.06]"
                          )}
                        >
                          <p className="text-sm font-medium">{opt.value}</p>
                          <p className="text-[10px] opacity-60 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

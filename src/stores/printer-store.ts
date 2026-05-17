import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { PrinterType, PrinterBrand } from "@/components/shipper/printer-driver";

export interface SavedPrinter {
  id: string;
  name: string;
  brand?: PrinterBrand;
}

export type Platform = "android" | "ios" | "unknown";

interface PrinterState {
  // Label dimensions
  labelWidthMm: number;
  labelHeightMm: number;
  dpi: number;

  // Printer type
  printerType: PrinterType;

  // Saved printer
  savedPrinter: SavedPrinter | null;

  // Platform
  platform: Platform;

  // Actions
  setLabelSize: (width: number, height: number) => void;
  setDpi: (dpi: number) => void;
  setPrinterType: (type: PrinterType) => void;
  setSavedPrinter: (printer: SavedPrinter | null) => void;
  setPlatform: (platform: Platform) => void;
  resetToDefaults: () => void;
}

const DEFAULTS = {
  labelWidthMm: 50,
  labelHeightMm: 30,
  dpi: 203,
};

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      labelWidthMm: DEFAULTS.labelWidthMm,
      labelHeightMm: DEFAULTS.labelHeightMm,
      dpi: DEFAULTS.dpi,
      printerType: "escpos" as PrinterType,
      savedPrinter: null,
      platform: "unknown" as Platform,

      setLabelSize: (width, height) => set({ labelWidthMm: width, labelHeightMm: height }),
      setDpi: (dpi) => set({ dpi }),
      setPrinterType: (printerType) => set({ printerType, savedPrinter: null }),
      setSavedPrinter: (printer) => set({ savedPrinter: printer }),
      setPlatform: (platform) => set({ platform }),
      resetToDefaults: () =>
        set({
          labelWidthMm: DEFAULTS.labelWidthMm,
          labelHeightMm: DEFAULTS.labelHeightMm,
          dpi: DEFAULTS.dpi,
        }),
    }),
    { name: "printer-settings" }
  )
);

// Selectors
export const useLabelConfig = () =>
  usePrinterStore(
    useShallow((s) => ({
      widthMm: s.labelWidthMm,
      heightMm: s.labelHeightMm,
      dpi: s.dpi,
    }))
  );

export const useSavedPrinter = () => usePrinterStore((s) => s.savedPrinter);

export const usePrinterType = () => usePrinterStore((s) => s.printerType);

export const usePlatform = () => usePrinterStore((s) => s.platform);

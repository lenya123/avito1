// Unified printer driver interface + factory
// Abstracts over Niimbot (proprietary protocol) and ESC/POS (generic BLE printers)

import { NiimbotDriver } from "./niimbot-printer";
import { EscPosDriver } from "./bluetooth-printer";

/** Detected printer brand (auto-detected from BLE device name) */
export type PrinterBrand = "niimbot" | "phomemo" | "hprt" | "xprinter" | "generic";

export interface PrinterDevice {
  id: string;
  name: string;
  brand?: PrinterBrand;
}

export interface PrinterDriver {
  readonly isConnected: boolean;
  readonly deviceName: string | null;
  connect(): Promise<PrinterDevice>;
  disconnect(): Promise<void>;
  printCanvas(canvas: HTMLCanvasElement): Promise<void>;
  printBatch(
    canvases: HTMLCanvasElement[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void>;
}

export type PrinterType = "escpos" | "niimbot";

// HMR-safe singleton storage
const GLOBAL_KEY_ESCPOS = "__escpos_printer__" as const;
const GLOBAL_KEY_NIIMBOT = "__niimbot_printer_driver__" as const;

type GlobalStore = Record<string, PrinterDriver | undefined>;

let lastType: PrinterType | null = null;

export function getPrinterDriver(type: PrinterType): PrinterDriver {
  const g = globalThis as unknown as GlobalStore;

  // If type changed, disconnect the old one
  if (lastType && lastType !== type) {
    const oldKey = lastType === "escpos" ? GLOBAL_KEY_ESCPOS : GLOBAL_KEY_NIIMBOT;
    const old = g[oldKey];
    if (old?.isConnected) {
      old.disconnect().catch(() => {});
    }
  }
  lastType = type;

  if (type === "niimbot") {
    if (!g[GLOBAL_KEY_NIIMBOT]) {
      g[GLOBAL_KEY_NIIMBOT] = new NiimbotDriver();
    }
    return g[GLOBAL_KEY_NIIMBOT]!;
  }

  if (!g[GLOBAL_KEY_ESCPOS]) {
    g[GLOBAL_KEY_ESCPOS] = new EscPosDriver();
  }
  return g[GLOBAL_KEY_ESCPOS]!;
}

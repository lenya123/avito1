// Generic ESC/POS BLE printer driver
// Works with Xprinter, HPRT, MUNBYN, Phomemo, and most Chinese thermal printers
// Requires Web Bluetooth API (Bluefy on iOS, Chrome on Android)

import type { PrinterDriver, PrinterDevice, PrinterBrand } from "./printer-driver";

// ---------------------------------------------------------------------------
// BLE debug logger — помогает отлаживать без физического принтера
// Включается через localStorage: localStorage.setItem("ble-debug", "1")
// ---------------------------------------------------------------------------
const bleLog = {
  enabled(): boolean {
    try {
      return localStorage.getItem("ble-debug") === "1";
    } catch {
      return false;
    }
  },
  log(tag: string, ...args: unknown[]) {
    if (this.enabled()) console.log(`[BLE:${tag}]`, ...args);
  },
  hex(tag: string, data: Uint8Array, maxBytes = 64) {
    if (!this.enabled()) return;
    const hex = Array.from(data.slice(0, maxBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const suffix = data.length > maxBytes ? ` ... (${data.length} bytes total)` : "";
    console.log(`[BLE:${tag}]`, hex + suffix);
  },
};

// ---------------------------------------------------------------------------
// Brand detection from BLE device name
// ---------------------------------------------------------------------------
const BRAND_PATTERNS: { brand: PrinterBrand; pattern: RegExp }[] = [
  { brand: "niimbot", pattern: /^(niimbot|b1|b3|b18|b21|b203|d101|d103|d110|d11|d203|d210|jc)/i },
  { brand: "phomemo", pattern: /^(phomemo|m02|m110|m120|m220|d30|t02|pm)/i },
  { brand: "hprt", pattern: /^(hprt|hm-t|t260|t360)/i },
  { brand: "xprinter", pattern: /^(xprinter|xp-|mp2)/i },
];

function detectBrand(deviceName: string): PrinterBrand {
  for (const { brand, pattern } of BRAND_PATTERNS) {
    if (pattern.test(deviceName)) return brand;
  }
  return "generic";
}

// ---------------------------------------------------------------------------
// Brand-specific BLE service & characteristic UUIDs
// ---------------------------------------------------------------------------

// Generic thermal printer UUIDs (works with most printers)
const GENERIC_SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Generic thermal printer
  "0000ff00-0000-1000-8000-00805f9b34fb", // Chinese thermal printers (Xprinter, HPRT, etc.)
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Some BLE printers
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip BLE
];

// Phomemo-specific UUIDs (from reverse-engineering via phomemo-tools)
const PHOMEMO_SERVICE_UUIDS = [
  "0000ff00-0000-1000-8000-00805f9b34fb", // Primary Phomemo service
  "000018f0-0000-1000-8000-00805f9b34fb", // Fallback
];

const PHOMEMO_WRITE_UUIDS = [
  "0000ff02-0000-1000-8000-00805f9b34fb", // Phomemo write characteristic
];

// All service UUIDs combined (for requestDevice optionalServices)
const ALL_SERVICE_UUIDS = Array.from(new Set([...GENERIC_SERVICE_UUIDS, ...PHOMEMO_SERVICE_UUIDS]));

const KNOWN_WRITE_UUIDS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
];

// ---------------------------------------------------------------------------
// ESC/POS commands
// ---------------------------------------------------------------------------
const ESC = 0x1b;
const GS = 0x1d;

// Standard ESC/POS init
const CMD_INIT = new Uint8Array([ESC, 0x40]); // ESC @ — initialize
const CMD_FEED = new Uint8Array([ESC, 0x64, 0x04]); // ESC d 4 — feed 4 lines

// Phomemo-specific initialization sequence
// (from reverse-engineering: phomemo-tools & BLE packet captures)
const PHOMEMO_CMD_INIT = new Uint8Array([
  ESC,
  0x40, // ESC @ — standard init
  0x1f,
  0x11,
  0x02,
  0x04, // Set concentration (print density)
]);

// Phomemo needs a different feed after print (shorter, printer does auto-cut)
const PHOMEMO_CMD_FEED = new Uint8Array([ESC, 0x64, 0x02]); // ESC d 2

// ---------------------------------------------------------------------------
// Brand-specific configuration
// ---------------------------------------------------------------------------
interface BrandConfig {
  label: string;
  initCmd: Uint8Array;
  feedCmd: Uint8Array;
  serviceUuids: string[];
  writeUuids: string[];
  chunkSize: number;
  chunkDelayMs: number;
  postInitDelayMs: number;
}

const BRAND_CONFIGS: Record<PrinterBrand, BrandConfig> = {
  phomemo: {
    label: "Phomemo",
    initCmd: PHOMEMO_CMD_INIT,
    feedCmd: PHOMEMO_CMD_FEED,
    serviceUuids: PHOMEMO_SERVICE_UUIDS,
    writeUuids: PHOMEMO_WRITE_UUIDS,
    chunkSize: 20,
    chunkDelayMs: 30,
    postInitDelayMs: 150,
  },
  hprt: {
    label: "HPRT",
    initCmd: CMD_INIT,
    feedCmd: CMD_FEED,
    serviceUuids: GENERIC_SERVICE_UUIDS,
    writeUuids: KNOWN_WRITE_UUIDS,
    chunkSize: 20,
    chunkDelayMs: 25,
    postInitDelayMs: 100,
  },
  xprinter: {
    label: "Xprinter",
    initCmd: CMD_INIT,
    feedCmd: CMD_FEED,
    serviceUuids: GENERIC_SERVICE_UUIDS,
    writeUuids: KNOWN_WRITE_UUIDS,
    chunkSize: 20,
    chunkDelayMs: 25,
    postInitDelayMs: 100,
  },
  generic: {
    label: "ESC/POS",
    initCmd: CMD_INIT,
    feedCmd: CMD_FEED,
    serviceUuids: GENERIC_SERVICE_UUIDS,
    writeUuids: KNOWN_WRITE_UUIDS,
    chunkSize: 20,
    chunkDelayMs: 30,
    postInitDelayMs: 100,
  },
  // Niimbot should never reach ESC/POS driver — rejected at connect()
  niimbot: {
    label: "Niimbot",
    initCmd: CMD_INIT,
    feedCmd: CMD_FEED,
    serviceUuids: [],
    writeUuids: [],
    chunkSize: 20,
    chunkDelayMs: 30,
    postInitDelayMs: 100,
  },
};

// ---------------------------------------------------------------------------
// BLE write helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Convert canvas to 1-bit monochrome raster (packed bytes, MSB first) */
function canvasToRaster(canvas: HTMLCanvasElement): {
  data: Uint8Array;
  width: number;
  height: number;
} {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bytesPerRow = Math.ceil(canvas.width / 8);
  const raster = new Uint8Array(bytesPerRow * canvas.height);

  for (let row = 0; row < canvas.height; row++) {
    for (let col = 0; col < canvas.width; col++) {
      const pixelIndex = (row * canvas.width + col) * 4;
      const r = imageData.data[pixelIndex];
      const g = imageData.data[pixelIndex + 1];
      const b = imageData.data[pixelIndex + 2];
      const isDark = (r + g + b) / 3 < 128;
      if (isDark) {
        const byteIndex = row * bytesPerRow + Math.floor(col / 8);
        const bitIndex = 7 - (col % 8);
        raster[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  return { data: raster, width: canvas.width, height: canvas.height };
}

// ---------------------------------------------------------------------------
// ESC/POS BLE Driver with multi-brand support
// ---------------------------------------------------------------------------
export class EscPosDriver implements PrinterDriver {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private _brand: PrinterBrand = "generic";

  get isConnected(): boolean {
    return this.server?.connected ?? false;
  }

  get deviceName(): string | null {
    return this.device?.name || null;
  }

  get brand(): PrinterBrand {
    return this._brand;
  }

  private get config(): BrandConfig {
    return BRAND_CONFIGS[this._brand];
  }

  async connect(): Promise<PrinterDevice> {
    if (!navigator.bluetooth) {
      throw new Error(
        "Web Bluetooth не поддерживается. Используйте Bluefy (iOS) или Chrome (Android)"
      );
    }

    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ALL_SERVICE_UUIDS,
    });

    const name = this.device.name || "";
    this._brand = detectBrand(name);

    bleLog.log("connect", `Device: "${name}", Brand: ${this._brand}`);

    // Niimbot printers need the Niimbot protocol, not ESC/POS
    if (this._brand === "niimbot") {
      this.device = null;
      this._brand = "generic";
      throw new Error(
        `«${name}» — это Niimbot. Переключите протокол на Niimbot в настройках принтера`
      );
    }

    this.server = await this.device.gatt!.connect();
    bleLog.log("connect", "GATT connected");

    this.writeCharacteristic = await this.findWriteCharacteristic();

    if (!this.writeCharacteristic) {
      this.server.disconnect();
      throw new Error("Не удалось найти характеристику записи на принтере");
    }

    bleLog.log(
      "connect",
      `Write characteristic: ${this.writeCharacteristic.uuid}`,
      `Service: ${this.writeCharacteristic.service.uuid}`
    );

    return {
      id: this.device.id,
      name: this.device.name || "Принтер",
      brand: this._brand,
    };
  }

  async disconnect(): Promise<void> {
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.server = null;
    this.writeCharacteristic = null;
    bleLog.log("disconnect", "Disconnected");
  }

  async printCanvas(canvas: HTMLCanvasElement): Promise<void> {
    const { data, width, height } = canvasToRaster(canvas);
    await this.printRaster(data, width, height);
  }

  async printBatch(
    canvases: HTMLCanvasElement[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const { initCmd, feedCmd, postInitDelayMs } = this.config;

    // Initialize once
    bleLog.hex("init", initCmd);
    await this.writeData(initCmd);
    await sleep(postInitDelayMs);

    for (let i = 0; i < canvases.length; i++) {
      onProgress?.(i + 1, canvases.length);
      const { data, width, height } = canvasToRaster(canvases[i]);
      const rasterCmd = this.buildRasterCommand(data, width, height);

      bleLog.log(
        "print",
        `Label ${i + 1}/${canvases.length}, ${width}x${height}px, ${rasterCmd.length} bytes`
      );

      try {
        await this.writeData(rasterCmd);
        await this.writeData(feedCmd);
        await sleep(200);
      } catch (err) {
        // One retry: reconnect and resend the current label
        if (!this.isConnected && this.device?.gatt) {
          bleLog.log("reconnect", `Connection lost at label ${i + 1}, retrying...`);
          try {
            this.server = await this.device.gatt.connect();
            this.writeCharacteristic = await this.findWriteCharacteristic();
            await sleep(300);
            await this.writeData(initCmd);
            await sleep(postInitDelayMs);
            await this.writeData(rasterCmd);
            await this.writeData(feedCmd);
            await sleep(200);
            continue;
          } catch {
            // Reconnect failed — surface original error
          }
        }
        throw err;
      }
    }
  }

  // --- Private ---

  private async findWriteCharacteristic(): Promise<BluetoothRemoteGATTCharacteristic | null> {
    if (!this.server) return null;

    const { serviceUuids, writeUuids } = this.config;

    // Try brand-specific service UUIDs first, then all known
    const uuidsToTry = Array.from(new Set([...serviceUuids, ...GENERIC_SERVICE_UUIDS]));

    for (const serviceUuid of uuidsToTry) {
      try {
        const service = await this.server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();

        bleLog.log(
          "discover",
          `Service ${serviceUuid}: ${characteristics.length} chars`,
          characteristics.map((c) => c.uuid)
        );

        // Prefer brand-specific write UUIDs
        for (const char of characteristics) {
          if (writeUuids.includes(char.uuid)) {
            bleLog.log("discover", `Matched brand-specific write UUID: ${char.uuid}`);
            return char;
          }
        }

        // Fallback to known write UUIDs
        for (const char of characteristics) {
          if (KNOWN_WRITE_UUIDS.includes(char.uuid)) {
            bleLog.log("discover", `Matched known write UUID: ${char.uuid}`);
            return char;
          }
        }

        // Fallback to any writable
        for (const char of characteristics) {
          if (char.properties.writeWithoutResponse || char.properties.write) {
            bleLog.log("discover", `Using writable characteristic: ${char.uuid}`);
            return char;
          }
        }
      } catch {
        // Service not found, try next
      }
    }

    // Last resort: scan all services for any writable characteristic
    try {
      const services = await this.server.getPrimaryServices();
      bleLog.log("discover", `Fallback scan: ${services.length} services`);
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.writeWithoutResponse || char.properties.write) {
            bleLog.log("discover", `Fallback writable: ${char.uuid} on service ${service.uuid}`);
            return char;
          }
        }
      }
    } catch {
      // Can't enumerate services
    }

    return null;
  }

  private async writeData(data: Uint8Array): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error("Принтер не подключён");
    }

    const { chunkSize, chunkDelayMs } = this.config;

    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, offset + chunkSize);
      if (this.writeCharacteristic.properties.writeWithoutResponse) {
        await this.writeCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.writeCharacteristic.writeValue(chunk);
      }
      await sleep(chunkDelayMs);
    }
  }

  private buildRasterCommand(
    rasterData: Uint8Array,
    widthPx: number,
    heightPx: number
  ): Uint8Array {
    const bytesPerRow = Math.ceil(widthPx / 8);

    // GS v 0 m xL xH yL yH d1...dk
    const header = new Uint8Array([
      GS,
      0x76,
      0x30,
      0x00, // m = 0 (normal density)
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff, // xL, xH
      heightPx & 0xff,
      (heightPx >> 8) & 0xff, // yL, yH
    ]);

    const command = new Uint8Array(header.length + rasterData.length);
    command.set(header, 0);
    command.set(rasterData, header.length);

    return command;
  }

  private async printRaster(
    rasterData: Uint8Array,
    widthPx: number,
    heightPx: number
  ): Promise<void> {
    const { initCmd, feedCmd, postInitDelayMs } = this.config;

    bleLog.hex("init", initCmd);
    await this.writeData(initCmd);
    await sleep(postInitDelayMs);

    const rasterCmd = this.buildRasterCommand(rasterData, widthPx, heightPx);
    bleLog.log("raster", `${widthPx}x${heightPx}px, ${rasterCmd.length} bytes`);
    bleLog.hex("raster-header", rasterCmd.slice(0, 8));
    await this.writeData(rasterCmd);

    await this.writeData(feedCmd);
    await sleep(100);
  }
}

// Niimbot BLE printer driver via @mmote/niimbluelib
// Works in Bluefy (iOS) and Chrome (Android) — requires Web Bluetooth API

import { NiimbotBluetoothClient, ImageEncoder, LabelType } from "@mmote/niimbluelib";
import type { PrinterModelMeta } from "@mmote/niimbluelib";
import type { PrinterDriver, PrinterDevice } from "./printer-driver";

export class NiimbotDriver implements PrinterDriver {
  private client: NiimbotBluetoothClient;
  private modelMeta: PrinterModelMeta | undefined;
  private _deviceName: string | null = null;

  constructor() {
    this.client = new NiimbotBluetoothClient();
  }

  get isConnected(): boolean {
    return this.client.isConnected();
  }

  get deviceName(): string | null {
    return this._deviceName;
  }

  async connect(): Promise<PrinterDevice> {
    if (!navigator.bluetooth) {
      throw new Error(
        "Web Bluetooth не поддерживается. Используйте Bluefy (iOS) или Chrome (Android)"
      );
    }

    // niimbluelib filters by uppercase namePrefix ("B", "D", ...),
    // but some printers advertise lowercase names (e.g. "b1-hb14030524").
    // Override requestDevice to accept all BLE devices so the printer shows up.
    const original = navigator.bluetooth.requestDevice.bind(navigator.bluetooth);
    navigator.bluetooth.requestDevice = () =>
      original({
        acceptAllDevices: true,
        optionalServices: this.client.getServiceUuidFilter(),
      });

    try {
      const connInfo = await this.client.connect();
      this._deviceName = connInfo.deviceName || "NIIMBOT";
      this.modelMeta = this.client.getModelMetadata();

      return {
        id: "niimbot",
        name: this._deviceName,
      };
    } finally {
      navigator.bluetooth.requestDevice = original;
    }
  }

  async disconnect(): Promise<void> {
    this.client.stopHeartbeat();
    await this.client.disconnect();
    this._deviceName = null;
    this.modelMeta = undefined;
  }

  async printCanvas(canvas: HTMLCanvasElement): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error("Принтер не подключён");
    }

    const printDirection = this.modelMeta?.printDirection ?? "left";
    const encodedImage = ImageEncoder.encodeCanvas(canvas, printDirection);

    const taskName = this.client.getPrintTaskType();

    if (!taskName) {
      throw new Error("Модель принтера не поддерживается");
    }

    const printTask = this.client.abstraction.newPrintTask(taskName, {
      labelType: LabelType.WithGaps,
      density: this.modelMeta?.densityDefault ?? 3,
      totalPages: 1,
      statusPollIntervalMs: 200,
      statusTimeoutMs: 10_000,
      pageTimeoutMs: 30_000,
    });

    try {
      await printTask.printInit();
      await printTask.printPage(encodedImage, 1);
      await printTask.waitForFinished();
    } finally {
      await printTask.printEnd();
    }
  }

  async printBatch(
    canvases: HTMLCanvasElement[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    for (let i = 0; i < canvases.length; i++) {
      onProgress?.(i + 1, canvases.length);
      await this.printCanvas(canvases[i]);
    }
  }
}

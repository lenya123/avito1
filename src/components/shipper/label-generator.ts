import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

// --- Types ---

export interface LabelData {
  orderNumber: number;
  avitoOrderId: string | null;
  trackingNumber: string | null;
  deliveryService: string;
  productName: string;
  size: string;
}

export interface LabelConfig {
  widthMm: number;
  heightMm: number;
  dpi: number;
}

const DELIVERY_LABELS: Record<string, string> = {
  cdek: "СДЭК",
  pochta: "Почта",
  avito: "Авито",
  yandex: "Яндекс",
  "5post": "5Post",
};

// --- Layout constants (fractions of label dimensions) ---

/** Safe margin for thermal print head (~2.5mm each side) */
const SAFE_MARGIN_MM = 2.5;

// Barcode label layout
const BARCODE_ZONE_HEIGHT = 0.48;
const TRACK_GAP_RATIO = 0.012;
const TRACK_FONT_MAX = 0.1;
const TRACK_FONT_MIN = 0.06;
const ERROR_FONT_RATIO = 0.08;
const SEPARATOR_Y_RATIO = 0.64;
const INFO_GAP_RATIO = 0.02;
const RIGHT_COL_WIDTH = 0.3;
const COL_GAP_RATIO = 0.03;
const ORDER_FONT_RATIO = 0.16;
const SIZE_GAP_RATIO = 0.04;
const SIZE_MAX_RATIO = 0.95;
const SIZE_MIN_RATIO = 0.5;
const SERVICE_MAX_RATIO = 0.38;
const SERVICE_MIN_RATIO = 0.22;
const PRODUCT_GAP_RATIO = 0.06;
const PRODUCT_MAX_RATIO = 0.45;
const PRODUCT_MIN_RATIO = 0.16;
const PRODUCT_LINE_HEIGHT = 1.25;
const MAX_PRODUCT_LINES = 2;

// QR label layout
const QR_MAX_WIDTH_RATIO = 0.44;
const QR_SEP_GAP_RATIO = 0.018;
const QR_LINE_GAP_RATIO = 0.03;
const QR_FONT_MAX_RATIO = 0.13;
const QR_FONT_MIN_RATIO = 0.065;
const QR_ERROR_FONT_RATIO = 0.07;
const QR_AVITO_FONT_SCALE = 0.85;
const QR_PRODUCT_FONT_SCALE = 0.8;
const QR_INNER_LINE_GAP_SCALE = 0.3;

// Colors
const COLOR_WHITE = "#FFFFFF";
const COLOR_BLACK = "#000000";
const COLOR_PLACEHOLDER_BG = "#F5F5F5";
const COLOR_PLACEHOLDER_TEXT = "#999999";
const COLOR_SEPARATOR = "#DDDDDD";
const COLOR_ORDER_NUM = "#666666";
const COLOR_PRODUCT_TEXT = "#333333";
const COLOR_QR_AVITO = "#333333";
const COLOR_QR_PRODUCT = "#444444";

// Barcode
const BARCODE_BAR_WIDTH = 2;

// --- Helpers ---

function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm * dpi) / 25.4);
}

/** Auto-fit text: reduce font size until it fits maxWidth */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFontSize: number,
  minFontSize: number,
  fontStyle: string
): number {
  for (let size = maxFontSize; size >= minFontSize; size--) {
    ctx.font = `${fontStyle} ${size}px`.replace(/^ /, "");
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minFontSize;
}

/** Word-wrap text into lines that fit maxWidth. Returns array of lines. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // If a single word is wider than maxWidth, force it on its own line
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines;
}

// --- Barcode Generation (direct canvas, no SVG intermediate) ---

function generateBarcodeCanvas(value: string, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: BARCODE_BAR_WIDTH,
    height,
    displayValue: false,
    margin: 0,
  });
  return canvas;
}

// --- QR Code Generation ---

async function generateQRCanvas(value: string, size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  await QRCode.toCanvas(canvas, value, {
    width: size,
    margin: 1,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return canvas;
}

// --- Main Label Generation ---

async function renderBarcodeLabel(
  data: LabelData,
  config: LabelConfig
): Promise<HTMLCanvasElement> {
  // Always landscape: width = longer dimension
  const w = mmToPx(Math.max(config.widthMm, config.heightMm), config.dpi);
  const h = mmToPx(Math.min(config.widthMm, config.heightMm), config.dpi);
  const pad = mmToPx(SAFE_MARGIN_MM, config.dpi);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = COLOR_WHITE;
  ctx.fillRect(0, 0, w, h);

  const cw = w - pad * 2; // content width

  // ── Layout: 3 zones ──────────────────────────────────────
  const barcodeTopY = pad;
  const barcodeH = Math.round(h * BARCODE_ZONE_HEIGHT);

  if (data.trackingNumber) {
    try {
      const barcodeCanvas = generateBarcodeCanvas(data.trackingNumber, barcodeH);
      const barcodeW = Math.min(cw, barcodeCanvas.width);
      const barcodeX = pad + Math.round((cw - barcodeW) / 2);
      ctx.drawImage(barcodeCanvas, barcodeX, barcodeTopY, barcodeW, barcodeH);

      const trackGap = Math.round(h * TRACK_GAP_RATIO);
      const trackMaxFont = Math.round(h * TRACK_FONT_MAX);
      const trackMinFont = Math.round(h * TRACK_FONT_MIN);
      const trackY = barcodeTopY + barcodeH + trackGap;

      const trackFontSize = fitText(ctx, data.trackingNumber, cw, trackMaxFont, trackMinFont, "");
      ctx.font = `${trackFontSize}px monospace`;
      ctx.fillStyle = COLOR_BLACK;
      ctx.textAlign = "center";
      ctx.fillText(data.trackingNumber, w / 2, trackY + trackFontSize * 0.85);
    } catch {
      ctx.fillStyle = COLOR_PLACEHOLDER_BG;
      ctx.fillRect(pad, barcodeTopY, cw, barcodeH);
      ctx.fillStyle = COLOR_PLACEHOLDER_TEXT;
      ctx.font = `${Math.round(h * ERROR_FONT_RATIO)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Ошибка штрихкода", w / 2, barcodeTopY + barcodeH / 2);
    }
  } else {
    ctx.fillStyle = COLOR_PLACEHOLDER_BG;
    ctx.fillRect(pad, barcodeTopY, cw, barcodeH);
    ctx.fillStyle = COLOR_PLACEHOLDER_TEXT;
    ctx.font = `${Math.round(h * ERROR_FONT_RATIO)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Нет трек-номера", w / 2, barcodeTopY + barcodeH / 2);
  }

  // ── Separator ─────────────────────────────────────────────
  const sepY = Math.round(h * SEPARATOR_Y_RATIO);
  ctx.strokeStyle = COLOR_SEPARATOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, sepY);
  ctx.lineTo(w - pad, sepY);
  ctx.stroke();

  // ── Zone 3: Two-column layout (bottom ~33%) ──────────────
  const infoStartY = sepY + Math.round(h * INFO_GAP_RATIO);
  const infoEndY = h - pad;
  const infoH = infoEndY - infoStartY;

  const serviceName = DELIVERY_LABELS[data.deliveryService] || data.deliveryService;
  const avitoLabel = data.avitoOrderId ? `AV-${data.avitoOrderId}` : `#${data.orderNumber}`;

  // ── Right column: order number (tiny top) + SIZE (huge center) ──
  const rightColW = Math.round(cw * RIGHT_COL_WIDTH);
  const colGap = Math.round(cw * COL_GAP_RATIO);

  const orderFontSize = Math.round(infoH * ORDER_FONT_RATIO);
  ctx.font = `${orderFontSize}px monospace`;
  ctx.fillStyle = COLOR_ORDER_NUM;
  ctx.textAlign = "right";
  ctx.fillText(avitoLabel, w - pad, infoStartY + orderFontSize);

  const sizeTopY = infoStartY + orderFontSize + Math.round(infoH * SIZE_GAP_RATIO);
  const sizeAvailH = infoEndY - sizeTopY;
  const sizeMaxFont = Math.round(sizeAvailH * SIZE_MAX_RATIO);
  const sizeMinFont = Math.round(sizeAvailH * SIZE_MIN_RATIO);
  const sizeFontSize = fitText(ctx, data.size, rightColW, sizeMaxFont, sizeMinFont, "bold");
  ctx.font = `bold ${sizeFontSize}px sans-serif`;
  ctx.fillStyle = COLOR_BLACK;
  ctx.textAlign = "right";
  const sizeCenterY = sizeTopY + Math.round(sizeAvailH / 2) + Math.round(sizeFontSize * 0.35);
  ctx.fillText(data.size, w - pad, sizeCenterY);

  // ── Left column: service name + product name (wrapping) ─────────
  const leftColW = cw - rightColW - colGap;

  const serviceMaxFont = Math.round(infoH * SERVICE_MAX_RATIO);
  const serviceMinFont = Math.round(infoH * SERVICE_MIN_RATIO);
  const serviceFontSize = fitText(
    ctx,
    serviceName,
    leftColW,
    serviceMaxFont,
    serviceMinFont,
    "bold"
  );
  const serviceY = infoStartY + serviceFontSize;
  ctx.font = `bold ${serviceFontSize}px sans-serif`;
  ctx.fillStyle = COLOR_BLACK;
  ctx.textAlign = "left";
  ctx.fillText(serviceName, pad, serviceY);

  const productGap = Math.round(infoH * PRODUCT_GAP_RATIO);
  const productStartY = serviceY + productGap;
  const productAvailH = infoEndY - productStartY;
  const productMaxFont = Math.round(productAvailH * PRODUCT_MAX_RATIO);
  const productMinFont = Math.round(infoH * PRODUCT_MIN_RATIO);
  const productFontSize = fitText(
    ctx,
    data.productName,
    leftColW,
    productMaxFont,
    productMinFont,
    ""
  );
  const productFont = `${productFontSize}px sans-serif`;
  const productLines = wrapText(ctx, data.productName, leftColW, productFont);
  if (productLines.length > MAX_PRODUCT_LINES) productLines.length = MAX_PRODUCT_LINES;

  ctx.font = productFont;
  ctx.fillStyle = COLOR_PRODUCT_TEXT;
  ctx.textAlign = "left";
  const productLineH = Math.round(productFontSize * PRODUCT_LINE_HEIGHT);
  for (let i = 0; i < productLines.length; i++) {
    ctx.fillText(productLines[i], pad, productStartY + productFontSize + i * productLineH);
  }

  return canvas;
}

async function renderQRLabel(data: LabelData, config: LabelConfig): Promise<HTMLCanvasElement> {
  // Always landscape
  const w = mmToPx(Math.max(config.widthMm, config.heightMm), config.dpi);
  const h = mmToPx(Math.min(config.widthMm, config.heightMm), config.dpi);
  const pad = mmToPx(SAFE_MARGIN_MM, config.dpi);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = COLOR_WHITE;
  ctx.fillRect(0, 0, w, h);

  const qrSize = Math.min(h - pad * 2, Math.round(w * QR_MAX_WIDTH_RATIO));
  const qrX = pad;
  const qrY = Math.round((h - qrSize) / 2);

  // ── Left: QR Code ─────────────────────────────────────────
  if (data.trackingNumber) {
    try {
      const qrCanvas = await generateQRCanvas(data.trackingNumber, qrSize);
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    } catch {
      ctx.fillStyle = COLOR_PLACEHOLDER_BG;
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = COLOR_PLACEHOLDER_TEXT;
      ctx.font = `${Math.round(h * QR_ERROR_FONT_RATIO)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Ошибка QR", qrX + qrSize / 2, qrY + qrSize / 2);
    }
  } else {
    ctx.fillStyle = COLOR_PLACEHOLDER_BG;
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = COLOR_PLACEHOLDER_TEXT;
    ctx.font = `${Math.round(h * QR_ERROR_FONT_RATIO)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Нет трек-номера", qrX + qrSize / 2, qrY + qrSize / 2);
  }

  // Vertical separator
  const gapX = Math.round(w * QR_SEP_GAP_RATIO);
  const sepX = qrX + qrSize + gapX;
  ctx.strokeStyle = COLOR_SEPARATOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sepX, pad);
  ctx.lineTo(sepX, h - pad);
  ctx.stroke();

  // ── Right: Text info ──────────────────────────────────────
  const textColX = sepX + gapX;
  const textColW = w - textColX - pad;

  const lineGap = Math.round(h * QR_LINE_GAP_RATIO);
  const maxFont = Math.round(h * QR_FONT_MAX_RATIO);
  const minFont = Math.round(h * QR_FONT_MIN_RATIO);

  const serviceName = DELIVERY_LABELS[data.deliveryService] || data.deliveryService;
  const avitoLabel = data.avitoOrderId ? `AV-${data.avitoOrderId}` : `#${data.orderNumber}`;

  const serviceSize = fitText(ctx, serviceName, textColW, maxFont, minFont, "bold");
  const avitoSize = fitText(
    ctx,
    avitoLabel,
    textColW,
    Math.round(maxFont * QR_AVITO_FONT_SCALE),
    minFont,
    ""
  );

  const productFontSize = fitText(
    ctx,
    data.productName,
    textColW,
    Math.round(maxFont * QR_PRODUCT_FONT_SCALE),
    minFont,
    ""
  );
  const productFont = `${productFontSize}px sans-serif`;
  const productLines = wrapText(ctx, data.productName, textColW, productFont);
  if (productLines.length > MAX_PRODUCT_LINES) productLines.length = MAX_PRODUCT_LINES;

  const sizeSize = fitText(ctx, data.size, textColW, maxFont, minFont, "bold");

  // Calculate total height for vertical centering
  const totalH =
    serviceSize +
    lineGap +
    avitoSize +
    lineGap +
    productLines.length * (productFontSize + Math.round(lineGap * QR_INNER_LINE_GAP_SCALE)) -
    Math.round(lineGap * QR_INNER_LINE_GAP_SCALE) +
    lineGap +
    sizeSize;
  let curY = Math.round((h - totalH) / 2);

  // Clip to text column
  ctx.save();
  ctx.beginPath();
  ctx.rect(textColX, 0, textColW + pad, h);
  ctx.clip();

  // Service name
  curY += serviceSize;
  ctx.font = `bold ${serviceSize}px sans-serif`;
  ctx.fillStyle = COLOR_BLACK;
  ctx.textAlign = "left";
  ctx.fillText(serviceName, textColX, curY);
  curY += lineGap;

  // Avito order ID
  curY += avitoSize;
  ctx.font = `${avitoSize}px monospace`;
  ctx.fillStyle = COLOR_QR_AVITO;
  ctx.fillText(avitoLabel, textColX, curY);
  curY += lineGap;

  // Product name (multi-line)
  ctx.font = productFont;
  ctx.fillStyle = COLOR_QR_PRODUCT;
  for (let i = 0; i < productLines.length; i++) {
    curY += productFontSize;
    ctx.fillText(productLines[i], textColX, curY);
    if (i < productLines.length - 1) curY += Math.round(lineGap * QR_INNER_LINE_GAP_SCALE);
  }
  curY += lineGap;

  // Size
  curY += sizeSize;
  ctx.font = `bold ${sizeSize}px sans-serif`;
  ctx.fillStyle = COLOR_BLACK;
  ctx.fillText(data.size, textColX, curY);

  ctx.restore();

  return canvas;
}

// --- Public API ---

export async function generateLabelCanvas(
  data: LabelData,
  config: LabelConfig
): Promise<HTMLCanvasElement> {
  return data.deliveryService === "5post"
    ? renderQRLabel(data, config)
    : renderBarcodeLabel(data, config);
}

export async function generateLabel(data: LabelData, config: LabelConfig): Promise<Blob> {
  const canvas = await generateLabelCanvas(data, config);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate label blob"));
    }, "image/png");
  });
}

export async function generateLabelRaster(
  data: LabelData,
  config: LabelConfig
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const canvas =
    data.deliveryService === "5post"
      ? await renderQRLabel(data, config)
      : await renderBarcodeLabel(data, config);

  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Convert RGBA to 1-bit monochrome (packed bytes, MSB first)
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

export async function generateBatchLabels(
  orders: LabelData[],
  config: LabelConfig
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const order of orders) {
    const blob = await generateLabel(order, config);
    blobs.push(blob);
  }
  return blobs;
}

export function orderToLabelData(order: {
  order_number: number;
  avito_order_id: string | null;
  tracking_number: string | null;
  delivery_service: string;
  product: { name: string } | null;
  system_comment?: string | null;
  size: string;
}): LabelData {
  return {
    orderNumber: order.order_number,
    avitoOrderId: order.avito_order_id,
    trackingNumber: order.tracking_number,
    deliveryService: order.delivery_service,
    productName: order.product?.name || order.system_comment || `Заказ #${order.order_number}`,
    size: order.size,
  };
}

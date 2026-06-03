/**
 * Парсеры данных Avito-заказа из BeduinUI ответа
 * `/api/2/profile/order?referenceID={id}` (мобильное API m.avito.ru).
 *
 * Реальная структура (на основе HAR-снимка m.avito.ru.har):
 *
 *   result.content.main.params.items[0].messagesDeeplink
 *     — содержит ?channelId=u2i-xxxxx в URL-encoded виде, это chat_id.
 *   result.content.main.params.referenceID — orderId.
 *   result.content.main.rootComponent._sources[ID]:
 *     - buyer: { name, firstLetter, deeplink (с userKey=...) }
 *     - priceBlock.priceList[] с title/value/valueType
 *     - priceBlock.totalPriceKopecks — нетто продавцу в копейках
 *     - eventsDates.orderCreated — текстовая дата создания
 *
 * Эта обвязка нужна, чтобы:
 * 1. Заполнить avito_buyer_name (имя покупателя)
 * 2. Заполнить avito_fee_snapshot (комиссия Avito)
 * 3. Найти chat_id для связи заказ↔чат (Open Q2 закрыто)
 */

export interface ParsedAvitoOrderDetail {
  /** Имя покупателя (с обрезкой zero-width пробелов Avito). */
  buyerName: string | null;
  /** Уникальный ключ покупателя из buyer.deeplink (?userKey=...). */
  buyerUserKey: string | null;
  /** Avito chat ID для связи order ↔ chat (из messagesDeeplink). */
  channelId: string | null;
  /** Avito listing ID (товар). */
  itemId: string | null;
  /** Сумма комиссии Avito ₽ (положительное число). */
  avitoFee: number | null;
  /** Сумма скидки на комиссию ₽ (если есть, отнимаем от комиссии). */
  feeDiscount: number | null;
  /** Цена для покупателя со скидкой (₽). */
  clientPrice: number | null;
  /** Нетто, которое получает продавец (₽). */
  sellerNet: number | null;

  // --- Отправка (deliveryInfo) ---
  /** Код отправки (то что показать на ПВЗ). Пример "5110607661". */
  dispatchCode: string | null;
  /** Форматированный (с пробелами) — для отображения. "511 060 7661". */
  dispatchCodeFormatted: string | null;
  /** URL картинки штрихкода 1280x320. */
  dispatchBarcodeUrl: string | null;
  /** Срок отправки текстом (например "3 июня"). */
  sellerSendTill: string | null;
  /** Имя провайдера доставки (Авито / Почта России). */
  deliveryProviderName: string | null;
  /** Ключ провайдера (avito-pvz / pochta). */
  deliveryProviderKey: string | null;

  // --- Возврат (returnDeliveryInfo) ---
  /** Трек возврата (для seller). */
  returnTrackingCode: string | null;
  /** URL картинки штрихкода возврата. */
  returnBarcodeUrl: string | null;
  /** Дата ожидаемого получения возврата ("18 мая"). */
  returnReceiveBy: string | null;
  /** Дата, после которой посылку уничтожат ("23 мая"). */
  returnDestroyBy: string | null;
  /** URL для трекинга возврата (например на pochta.ru). */
  returnTrackingUrl: string | null;
  /** Имя провайдера возврата. */
  returnProviderName: string | null;
  /** Нужен ли confirm-код для подтверждения возврата. */
  returnConfirmCodeEnabled: boolean;
}

/**
 * Парсит сырой BeduinUI-ответ /api/2/profile/order?referenceID={id}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAvitoOrderDetail(raw: any): ParsedAvitoOrderDetail {
  const result: ParsedAvitoOrderDetail = {
    buyerName: null,
    buyerUserKey: null,
    channelId: null,
    itemId: null,
    avitoFee: null,
    feeDiscount: null,
    clientPrice: null,
    sellerNet: null,
    dispatchCode: null,
    dispatchCodeFormatted: null,
    dispatchBarcodeUrl: null,
    sellerSendTill: null,
    deliveryProviderName: null,
    deliveryProviderKey: null,
    returnTrackingCode: null,
    returnBarcodeUrl: null,
    returnReceiveBy: null,
    returnDestroyBy: null,
    returnTrackingUrl: null,
    returnProviderName: null,
    returnConfirmCodeEnabled: false,
  };

  const main = raw?.result?.content?.main;
  if (!main) return result;

  // 1) items[0] → chat channelId + itemId
  const item = main.params?.items?.[0];
  if (item) {
    result.itemId = item.itemId != null ? String(item.itemId) : null;
    if (typeof item.messagesDeeplink === "string") {
      const dec = decodeURIComponent(item.messagesDeeplink);
      const m = /channelId=([^&"\s]+)/.exec(dec);
      if (m) result.channelId = m[1];
    }
  }

  // 2) _sources содержит реальные данные (buyer, priceBlock).
  // Перебираем все sources, ищем первый с buyer/priceBlock.
  const sources = main.rootComponent?._sources;
  if (sources && typeof sources === "object") {
    for (const key of Object.keys(sources)) {
      const s = sources[key];
      if (!s || typeof s !== "object") continue;

      if (s.buyer && !result.buyerName) {
        const rawName = String(s.buyer.name ?? "");
        // Avito оборачивает имена zero-width пробелами (​, ‌).
        result.buyerName = rawName.replace(/[​-‍﻿]/g, "").trim() || null;
        const dl = String(s.buyer.deeplink ?? "");
        const um = /userKey=([a-zA-Z0-9]+)/.exec(dl);
        if (um) result.buyerUserKey = um[1];
      }

      // deliveryInfo — отправка (код + штрихкод + срок + ПВЗ)
      if (s.deliveryInfo && result.dispatchCode == null) {
        const di = s.deliveryInfo;
        if (di.dispatchNumber?.original) {
          result.dispatchCode = String(di.dispatchNumber.original);
        }
        if (di.dispatchNumber?.formatted) {
          result.dispatchCodeFormatted = String(di.dispatchNumber.formatted);
        }
        if (di.sendBarcode?.url) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const urls = di.sendBarcode.url as Record<string, any>;
          result.dispatchBarcodeUrl =
            (urls.size1280x3202 as string | undefined) ??
            (Object.values(urls).find((v) => typeof v === "string") as string | undefined) ??
            null;
        }
        if (typeof di.sellerSendTill === "string") {
          result.sellerSendTill = di.sellerSendTill;
        }
      }
      // deliveryProvider — провайдер доставки
      if (s.deliveryProvider && result.deliveryProviderName == null) {
        const dp = s.deliveryProvider;
        result.deliveryProviderName =
          dp.name?.nominative ?? dp.name?.genitive ?? dp.name ?? null;
        result.deliveryProviderKey = dp.key ?? null;
      }
      // returnDeliveryInfo — возврат
      if (s.returnDeliveryInfo && result.returnTrackingCode == null) {
        const ri = s.returnDeliveryInfo;
        if (ri.dispatchNumber?.original) {
          result.returnTrackingCode = String(ri.dispatchNumber.original);
        } else if (ri.parcelID) {
          result.returnTrackingCode = String(ri.parcelID);
        }
        if (ri.receiveBarcode?.url) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const urls = ri.receiveBarcode.url as Record<string, any>;
          result.returnBarcodeUrl =
            (urls.size1280x3202 as string | undefined) ??
            (Object.values(urls).find((v) => typeof v === "string") as string | undefined) ??
            null;
        }
        if (typeof ri.deliveryDate === "string") result.returnReceiveBy = ri.deliveryDate;
        if (typeof ri.destroyDate === "string") result.returnDestroyBy = ri.destroyDate;
        result.returnConfirmCodeEnabled = !!ri.isConfirmCodeEnabled;
      }
      // returnDeliveryInfo использует ту же deliveryProvider секцию.
      // На возвратах провайдер обычно отдельный (Почта России) — берём из same source.
      if (s.deliveryProvider && s.returnDeliveryInfo) {
        const dp = s.deliveryProvider;
        result.returnProviderName =
          dp.name?.nominative ?? dp.name?.genitive ?? dp.name ?? null;
        if (typeof dp.trackingUrl === "string") {
          result.returnTrackingUrl = dp.trackingUrl;
        }
      }

      if (s.priceBlock && result.avitoFee == null) {
        const pb = s.priceBlock;
        // totalPriceKopecks — нетто продавцу.
        if (typeof pb.totalPriceKopecks === "number") {
          result.sellerNet = pb.totalPriceKopecks / 100;
        }
        // Перебираем priceList: комиссия = title содержит "Комиссия за продажу",
        // valueType "negative". Скидка на комиссию — отдельная позиция.
        const pl = Array.isArray(pb.priceList) ? pb.priceList : [];
        for (const it of pl) {
          const title = String(it?.title ?? "");
          const value = parseRubFromString(String(it?.value ?? ""));
          if (value == null) continue;

          if (/Комиссия за продажу/i.test(title)) {
            // Знак уже учтён в valueType=negative, забираем абсолютное.
            result.avitoFee = Math.abs(value);
          } else if (/Скидка на комиссию/i.test(title)) {
            result.feeDiscount = Math.abs(value);
          } else if (/Цена товара/i.test(title) || /заплатил/i.test(title)) {
            result.clientPrice = value;
          } else if (/^\d+\s+товар/i.test(title) && result.clientPrice == null) {
            // "1 товар" — оригинальная цена, fallback если нет скидочной.
            result.clientPrice = value;
          }
        }
        // Если есть скидка на комиссию — фактическая комиссия меньше.
        if (result.avitoFee != null && result.feeDiscount != null) {
          result.avitoFee = Math.max(0, result.avitoFee - result.feeDiscount);
        }
      }
    }
  }

  return result;
}

/**
 * Парсит строку вида "1 866,00 ₽" или "−171 ₽" в число рублей.
 * Возвращает |value| (знак отбрасываем, его несёт valueType).
 */
function parseRubFromString(s: string): number | null {
  if (!s) return null;
  // Убираем неразрывные пробелы, ₽, минус.
  const cleaned = s.replace(/[\s ]/g, "").replace(/[₽−-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// ===========================================================================
// Order-log парсер (/api/2/order-log?orderId={id})
// ===========================================================================

export interface ParsedAvitoOrderLog {
  paidAt: string | null;
  sentAt: string | null;
  arrivedAtBuyerPvzAt: string | null;
  deliveredAt: string | null;
  returnInitiatedAt: string | null;
  returnArrivedAt: string | null;
  trackingNumber: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAvitoOrderLog(raw: any): ParsedAvitoOrderLog {
  const result: ParsedAvitoOrderLog = {
    paidAt: null,
    sentAt: null,
    arrivedAtBuyerPvzAt: null,
    deliveredAt: null,
    returnInitiatedAt: null,
    returnArrivedAt: null,
    trackingNumber: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = raw?.result?.content?.main?.params?.orderHistoryItems ?? [];
  let sawCard24 = false;
  for (const it of items) {
    const icon = String(it?.icon ?? "");
    const titleText = joinTitleItems(it?.titleItems);
    const lower = titleText.toLowerCase();
    const iso = parseAvitoTimelineDate(String(it?.date ?? ""));
    if (!result.trackingNumber) {
      const tn = extractTrackingFromDescription(it?.descriptionItems);
      if (tn) result.trackingNumber = tn;
    }
    if (icon === "time24" && !result.paidAt) result.paidAt = iso;
    if (icon === "delivery24" && lower.includes("отправлен") && !result.sentAt) {
      result.sentAt = iso;
    }
    if (icon === "orders24" && lower.includes("доставлен") && lower.includes("пункт")) {
      result.arrivedAtBuyerPvzAt = iso;
    }
    if (icon === "card24" && !sawCard24) {
      result.deliveredAt = iso;
      sawCard24 = true;
    }
    if (
      (lower.includes("возврат") ||
        lower.includes("оформил возврат")) &&
      !lower.includes("пункт выдачи") &&
      !result.returnInitiatedAt
    ) {
      result.returnInitiatedAt = iso;
    }
    if (
      lower.includes("возврат") &&
      lower.includes("пункт выдачи") &&
      !result.returnArrivedAt
    ) {
      result.returnArrivedAt = iso;
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function joinTitleItems(titleItems: any): string {
  if (!Array.isArray(titleItems)) return "";
  return titleItems
    .map((t) => (typeof t === "object" && t ? String(t.value ?? "") : String(t ?? "")))
    .join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTrackingFromDescription(descriptionItems: any): string | null {
  if (!Array.isArray(descriptionItems)) return null;
  for (const d of descriptionItems) {
    const ti = d?.textItems;
    if (!Array.isArray(ti)) continue;
    for (const item of ti) {
      const actions = item?.actions;
      if (Array.isArray(actions)) {
        for (const a of actions) {
          if (a?.actionType === "copy" && typeof a.copiedValue === "string") {
            const v = a.copiedValue.replace(/\D/g, "");
            if (v.length >= 10) return v;
          }
        }
      }
    }
  }
  return null;
}

const RU_MONTHS: Record<string, number> = {
  "января": 0,
  "февраля": 1,
  "марта": 2,
  "апреля": 3,
  "мая": 4,
  "июня": 5,
  "июля": 6,
  "августа": 7,
  "сентября": 8,
  "октября": 9,
  "ноября": 10,
  "декабря": 11,
};

function parseAvitoTimelineDate(s: string): string | null {
  if (!s) return null;
  const m = /(\d{1,2}):(\d{2})\s+(\d{1,2})\s+([а-яё]+)/i.exec(s);
  if (!m) return null;
  const [, hh, mm, dd, monName] = m;
  const month = RU_MONTHS[monName.toLowerCase()];
  if (month == null) return null;
  const now = new Date();
  let year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month, Number(dd), Number(hh), Number(mm)));
  if (candidate.getTime() - now.getTime() > 14 * 86400 * 1000) {
    year -= 1;
  }
  return new Date(
    Date.UTC(year, month, Number(dd), Number(hh), Number(mm))
  ).toISOString();
}

/**
 * Web-клиент для Avito через cookies + proxy.
 *
 * Весь парсинг данных идёт через браузерную сессию (cookies из Puppeteer),
 * запросы проксируются через IPv4 прокси, привязанный к аккаунту.
 * Не требует платной подписки Avito Developer — используются внутренние
 * web API эндпоинты, которые вызывает SPA фронтенд Avito.
 *
 * Покрытые эндпоинты:
 * - GET /web/1/orders — заказы продавца
 * - GET /web/1/user/items — объявления пользователя
 * - GET /web/2/stats/items — статистика по объявлениям
 * - GET /web/1/messenger/chats — чаты
 * - GET /web/1/messenger/chats/{chatId}/messages — сообщения
 * - POST /web/1/messenger/chats/{chatId}/messages — отправка сообщения
 * - GET /web/1/profile/ratings — отзывы и рейтинг
 */

import type { AvitoWebOrder, AvitoWebOrdersResponse } from "./types";
import { ProxyAgent } from "undici";
import { randomUUID } from "crypto";
import { resolveAvitoBrandId, AVITO_BRAND_NO } from "./avito-brands";

const AVITO_WEB_BASE = "https://www.avito.ru";
const REQUEST_TIMEOUT_MS = 15_000;

export class SessionExpiredError extends Error {
  constructor() {
    super("Avito session expired (401/403)");
    this.name = "SessionExpiredError";
  }
}

export interface BrowserSession {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
  proxyUrl?: string | null;
  platform?: string | null;
  /** ТЗ §15.9: per-user токен Avito для BeduinUI endpoints. Извлекается
   *  при login (см. fetchAvitoApiKey), сохраняется в avito_browser_sessions.api_key. */
  apiKey?: string | null;
}

function buildCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Sec-Ch-Ua brand строки per Chrome version (различаются между мажорными версиями) */
const SEC_CH_UA_BRANDS: Record<string, string> = {
  "132": `"Chromium";v="132", "Not_A Brand";v="24", "Google Chrome";v="132"`,
  "133": `"Chromium";v="133", "Not(A:Brand";v="99", "Google Chrome";v="133"`,
  "134": `"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"`,
};

function buildSecChUa(userAgent: string): string {
  const match = userAgent.match(/Chrome\/(\d+)/);
  const version = match ? match[1] : "133";
  return SEC_CH_UA_BRANDS[version] ?? SEC_CH_UA_BRANDS["133"];
}

function detectPlatform(ua: string): { mobile: "?0" | "?1"; platform: string } {
  // Sec-Ch-Ua-Mobile / Sec-Ch-Ua-Platform должны соответствовать User-Agent,
  // иначе Avito палит несоответствие и возвращает 401/403.
  if (/Android/i.test(ua)) return { mobile: "?1", platform: '"Android"' };
  if (/iPhone|iPad|iPod/i.test(ua)) return { mobile: "?1", platform: '"iOS"' };
  if (/Macintosh|Mac OS X/i.test(ua)) return { mobile: "?0", platform: '"macOS"' };
  if (/Linux/i.test(ua)) return { mobile: "?0", platform: '"Linux"' };
  return { mobile: "?0", platform: '"Windows"' };
}

function buildHeaders(session: BrowserSession): Record<string, string> {
  const plat = detectPlatform(session.userAgent);
  return {
    "User-Agent": session.userAgent,
    Cookie: buildCookieHeader(session.cookies),
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://www.avito.ru/orders",
    "X-Requested-With": "XMLHttpRequest",
    // Sec-Fetch-* — Chrome отправляет их автоматически; их отсутствие = явный сигнал бота
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    // Client Hints — должны соответствовать UA (mobile/platform).
    "Sec-Ch-Ua": buildSecChUa(session.userAgent),
    "Sec-Ch-Ua-Mobile": plat.mobile,
    "Sec-Ch-Ua-Platform": plat.platform,
  };
}

async function avitoWebFetch(
  path: string,
  session: BrowserSession,
  options?: { method?: string; body?: unknown; referer?: string }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${AVITO_WEB_BASE}${path}`;
    const headers = buildHeaders(session);
    if (options?.referer) {
      headers.Referer = options.referer;
    }

    const method = options?.method ?? "GET";
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method,
      headers,
      signal: controller.signal,
    };

    if (options?.body) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    if (session.proxyUrl) {
      const dispatcher = new ProxyAgent(session.proxyUrl);
      fetchOptions.dispatcher = dispatcher;
    }

    const response = await fetch(url, fetchOptions as RequestInit);

    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError();
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAvitoOrdersCount(
  session: BrowserSession
): Promise<{ purchases: number; sales: number }> {
  const response = await avitoWebFetch("/web/1/orders/count/action", session);
  return response.json();
}

export async function fetchAvitoOrders(
  session: BrowserSession,
  page: number = 1,
  limit: number = 20
): Promise<AvitoWebOrdersResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    action: "sell",
  });

  const response = await avitoWebFetch(`/web/1/orders?${params}`, session);

  if (!response.ok) {
    throw new Error(`Avito web API error: ${response.status}`);
  }

  const data = await response.json();

  // Маппинг ответа Avito к нашему типу
  const orders: AvitoWebOrder[] = (data.orders ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: any): AvitoWebOrder => ({
      orderId: String(o.orderId ?? o.id ?? ""),
      status: {
        value: o.status?.value ?? "",
        label: o.status?.label ?? "",
        color: o.status?.color ?? "",
        requiredAction: o.status?.requiredAction ?? false,
      },
      cost: { total: o.cost?.total ?? 0 },
      createdAt: o.createdAt ?? o.created_at ?? "",
      updatedAt: o.updatedAt ?? o.updated_at ?? "",
      imgSet: Array.isArray(o.imgSet) ? o.imgSet : [],
      provider: {
        value: o.provider?.value ?? "",
        label: o.provider?.label ?? "",
        trackingNumber: o.provider?.trackingNumber ?? o.provider?.copiedTrackingNumber,
        copiedTrackingNumber: o.provider?.copiedTrackingNumber,
      },
      channelId: String(o.channelId ?? ""),
      serviceKey: o.serviceKey ?? "",
      userKind: o.userKind ?? "seller",
      totalItemsCount: o.totalItemsCount ?? 1,
      info: o.info,
    })
  );

  return {
    orders,
    hasMore: data.hasMore ?? false,
    hasArchive: data.hasArchive ?? false,
  };
}

// =============================================================================
// Order details (детали конкретного заказа: адрес почты, QR/barcode, код)
// =============================================================================

export interface AvitoOrderDeliveryDetails {
  /** Куда нести (адрес пункта/почты) */
  pickupAddress: string | null;
  /** Режим работы */
  pickupSchedule: string | null;
  /** Номер отправления / трек (parcelID) */
  parcelId: string | null;
  /** Отформатированный номер "805 103 212 74715" */
  parcelIdFormatted: string | null;
  /** КОД ПОДТВЕРЖДЕНИЯ — короткий (4 цифры), который называют в отделении.
   * Обновляется Avito раз в сутки. Получается отдельным запросом. */
  confirmCode: string | null;
  /** URL картинки barcode/QR (Avito generate endpoint) */
  barcodeUrl: string | null;
  /** "code128" или "qr" */
  barcodeType: string | null;
  /** Есть ли barcode (false для Почты России — только код) */
  isBarcodeAvailable: boolean;
  /** Раздел detail: "return" (возврат) | "dispatch" (отправка) | "receive" */
  flow: "return" | "dispatch" | "receive" | "unknown";
  /** Срок до которого надо забрать/отнести */
  deadline: string | null;
  /** Внутренний shipmentId (для refresh confirmCode) */
  shipmentId: string | null;
}

/**
 * Получить детали заказа: адрес пункта выдачи/почты, код для предъявления,
 * URL barcode/QR. Avito возвращает server-driven-UI с глубокой вложенностью —
 * парсим только нужные поля.
 */
export async function fetchAvitoOrderDetails(
  session: BrowserSession,
  orderId: string
): Promise<AvitoOrderDeliveryDetails | null> {
  const url = `/web/2/profile/order?referenceID=${encodeURIComponent(orderId)}&templateVersion=0&srcp=orders_list&location=Europe/Moscow`;
  const response = await avitoWebFetch(url, session, {
    referer: `https://www.avito.ru/orders/${orderId}?source=orders_list`,
  });
  if (!response.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json().catch(() => null);
  if (!data) return null;

  // Avito server-driven UI: result.content.main.rootComponent._sources.{N}.{returnDeliveryInfo|dispatchDeliveryInfo|...}
  const sources = data?.result?.content?.main?.rootComponent?._sources;
  if (!sources || typeof sources !== "object") return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let infoObj: any = null;
  let flow: AvitoOrderDeliveryDetails["flow"] = "unknown";
  for (const src of Object.values(sources)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = src as any;
    if (s?.returnDeliveryInfo) { infoObj = s.returnDeliveryInfo; flow = "return"; break; }
    if (s?.dispatchDeliveryInfo) { infoObj = s.dispatchDeliveryInfo; flow = "dispatch"; break; }
    if (s?.receiveDeliveryInfo) { infoObj = s.receiveDeliveryInfo; flow = "receive"; break; }
  }
  if (!infoObj) return null;

  const terminal = infoObj.terminal ?? {};
  const barcode = infoObj.receiveBarcode ?? infoObj.dispatchBarcode ?? infoObj.barcode ?? {};
  const dispatchNum = infoObj.sellerDispatchNumber ?? infoObj.dispatchNumber ?? {};

  // shipmentId извлекаем из terminal.deeplink (внутренний id для отдельных API)
  let shipmentId: string | null = null;
  try {
    const dl = terminal?.deeplink ?? "";
    const m = dl.match(/shipmentId%22%3A%22(\d+)%22/) || dl.match(/"shipmentId":"(\d+)"/);
    if (m) shipmentId = m[1];
  } catch {/* ignore */}

  // Если есть shipmentId — догружаем КОД ПОДТВЕРЖДЕНИЯ через отдельный endpoint.
  // Avito возвращает 4-значный код в success.main.params["&code"].
  let confirmCode: string | null = null;
  if (shipmentId && infoObj.isConfirmCodeEnabled) {
    try {
      const codeRes = await avitoWebFetch(
        `/api/1/logistics/shipment/confirmationCode/show?shipmentId=${shipmentId}`,
        session,
        { referer: `https://www.avito.ru/orders/${orderId}` }
      );
      if (codeRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const codeData: any = await codeRes.json().catch(() => null);
        const c = codeData?.success?.main?.params?.["&code"] ?? codeData?.code ?? null;
        if (c) confirmCode = String(c);
      }
    } catch {/* ignore */}
  }

  return {
    pickupAddress: terminal.address ?? null,
    pickupSchedule: terminal.schedule ?? null,
    parcelId: dispatchNum.original ?? infoObj.parcelID ?? null,
    parcelIdFormatted: dispatchNum.formatted ?? dispatchNum.original ?? infoObj.parcelID ?? null,
    confirmCode,
    barcodeUrl: barcode?.url?.size1280x3202 ?? barcode?.url?.default ?? barcode?.url ?? null,
    barcodeType: barcode?.type ?? null,
    isBarcodeAvailable: Boolean(infoObj.isBarcodeAvailable),
    flow,
    deadline: infoObj.destroyDate ?? infoObj.deliveryDate ?? null,
    shipmentId,
  };
}

// =============================================================================
// Items (объявления пользователя)
// =============================================================================

export interface WebAvitoItem {
  id: number;
  title: string;
  price: number;
  url: string;
  status: string; // active | removed | blocked | rejected | old
  imageUrl: string | null;
  categoryName: string | null;
  address: string | null;
  contacts: number;
  favorites: number;
  views: number;
}

export interface WebAvitoItemsResponse {
  items: WebAvitoItem[];
  total: number;
  hasMore: boolean;
}

/**
 * Получить объявления пользователя через web API.
 * Эндпоинт: GET /web/1/user/items
 * Referer: https://www.avito.ru/profile/items
 */
export async function fetchAvitoItems(
  session: BrowserSession,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _page: number = 1,
  count: number = 50,
  status?: string
): Promise<WebAvitoItemsResponse> {
  // Сначала пытаемся через mobile BeduinUI (m.avito.ru/api/13/serp/profile/items?key=...)
  // — он возвращает любой shortcut (active, paused, archived, draft, ...) одним
  // вызовом без OAuth. Если apiKey недоступен — fallback на web-flow ниже.
  if (session.apiKey) {
    const shortcut = status || "active";
    const url = `https://m.avito.ru/api/13/serp/profile/items?key=${encodeURIComponent(session.apiKey)}&shortcut=${encodeURIComponent(shortcut)}&offset=0&limit=${encodeURIComponent(String(count))}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers = {
        "User-Agent": session.userAgent,
        Cookie: buildCookieHeader(session.cookies),
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ru-RU,ru;q=0.9",
        Referer: "https://m.avito.ru/profile/items",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Ch-Ua": buildSecChUa(session.userAgent),
        "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
        "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
      } as Record<string, string>;
      const opts: RequestInit & { dispatcher?: unknown } = {
        method: "GET",
        headers,
        signal: controller.signal,
      };
      if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);

      const resp = await fetch(url, opts as RequestInit);
      if (resp.status === 401 || resp.status === 403) {
        throw new SessionExpiredError();
      }
      if (resp.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await resp.json();
        // Mobile BeduinUI отдаёт: {success:{list:[{user_item:{id,title,price,...}}]}}
        const rawListRaw = data?.success?.list ?? data?.list ?? data?.itemsList ?? data?.items?.itemsList ?? data?.items ?? data?.result?.list ?? [];
        // Раскрываем wrapper user_item для каждой записи (если есть).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawItems = (rawListRaw as any[]).map((r) => r?.user_item ?? r);
        const items = mapAvitoRawItems(rawItems, status);
        return { items, total: items.length, hasMore: items.length >= count };
      }
      // не-OK — падаем в fallback
    } catch (e) {
      if (e instanceof SessionExpiredError) throw e;
      // network/timeout — fallthrough
    } finally {
      clearTimeout(timeout);
    }
  }

  // Fallback: старый web-flow (поддерживает только active + inactive)
  const tabPath =
    status === "active" ? "/profile/items/active"
    : status === "inactive" ? "/profile/items/inactive"
    : "/profile";
  const body: Record<string, unknown> = {
    searchQuery: `https://www.avito.ru${tabPath}`,
  };

  const response = await avitoWebFetch("/web/1/serp/profile/items", session, {
    method: "POST",
    body,
    referer: "https://www.avito.ru/profile/items",
  });

  if (!response.ok) {
    throw new Error(`Avito web items error: ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();

  // Реальный формат: { items: { itemsList: [...] }, breadcrumbs: { itemsCount } }
  const rawItems = data.items?.itemsList ?? data.items ?? data.resources ?? [];

  const items = mapAvitoRawItems(rawItems);
  const totalCount = data.breadcrumbs?.itemsCount ?? items.length;

  return {
    items,
    total: totalCount,
    hasMore: items.length >= count,
  };
}

// Достаём числовую цену из любого источника: number / object / строка
// (mobile API отдаёт "100 ₽" / "5 000 ₽" / "от 1 000 ₽" — нужны только цифры).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPrice(raw: any): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  if (typeof raw === "object") {
    return raw.valueNotFormatted ?? extractPrice(raw.value) ?? extractPrice(raw.text) ?? 0;
  }
  if (typeof raw === "string") {
    const digits = raw.replace(/\s|&nbsp;|&#160;/g, "").match(/\d+/);
    return digits ? Number(digits[0]) : 0;
  }
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAvitoRawItems(rawItems: any[], statusFallback?: string): WebAvitoItem[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rawItems ?? []).map((item: any) => {
    let imageUrl: string | null = null;
    if (item.images?.[0]) {
      const firstImage = item.images[0];
      const rawUrl = firstImage.url230x172 ?? firstImage.url148x110 ?? firstImage.url ?? null;
      imageUrl = rawUrl ? (rawUrl.startsWith("//") ? "https:" + rawUrl : rawUrl) : null;
    }
    // Mobile-формат: images = {count, main:{100x75,...,1280x960}} — берём бóльшие
    if (!imageUrl && item.images?.main) {
      const m = item.images.main;
      const raw =
        m["640x480"] ??
        m["1280x960"] ??
        m["240x180"] ??
        m["200x150"] ??
        m["100x75"] ??
        Object.values(m).find((v) => typeof v === "string");
      if (typeof raw === "string") {
        imageUrl = raw.startsWith("//") ? "https:" + raw : raw;
      }
    }
    const itemStatus = item.enabledFlg === false ? "inactive" : (item.status ?? statusFallback ?? "active");
    return {
      id: item.id ?? 0,
      title: item.title ?? "",
      price: extractPrice(item.price),
      url: item.url ? (item.url.startsWith("http") ? item.url : `https://www.avito.ru${item.url}`) : `https://www.avito.ru/${item.id}`,
      status: itemStatus,
      imageUrl,
      categoryName: item.categoryName ?? item.category?.name ?? null,
      address: item.geo?.formattedAddress ?? null,
      // Mobile BeduinUI прячет счётчики в item.stats.{views,favorites,contacts}.{total,today}
      // (выявлено по HAR /api/13/serp/profile/items). item.views/contacts на верхнем
      // уровне НЕ существуют → старый маппинг всегда давал 0. Читаем stats первым.
      contacts: item.stats?.contacts?.total ?? (typeof item.contacts === "object" ? (item.contacts?.total ?? 0) : (item.contacts ?? 0)),
      favorites: item.stats?.favorites?.total ?? (typeof item.favorites === "object" ? (item.favorites?.total ?? 0) : (item.favorites ?? 0)),
      views: item.stats?.views?.total ?? (typeof item.views === "object" ? (item.views?.total ?? 0) : (item.views ?? 0)),
    };
  });
}

// =============================================================================
// Stats (статистика по объявлениям)
// =============================================================================

export interface WebAvitoItemStats {
  itemId: number;
  views: number;
  favorites: number;
  contacts: number;
}

export interface WebAvitoStatsResponse {
  items: WebAvitoItemStats[];
}

/**
 * Получить статистику по объявлениям через web API.
 * Эндпоинт: POST /web/2/stats/items
 * Referer: https://www.avito.ru/profile/items
 *
 * Avito SPA загружает статистику POST-запросом с диапазоном дат и списком itemIds.
 */
export async function fetchAvitoItemStats(
  session: BrowserSession,
  dateFrom: string,
  dateTo: string,
  itemIds: number[]
): Promise<WebAvitoStatsResponse> {
  if (itemIds.length === 0) {
    return { items: [] };
  }

  const response = await avitoWebFetch("/web/1/profile/items/stats", session, {
    method: "POST",
    body: {
      dateFrom,
      dateTo,
      itemIds,
      fields: ["views", "contacts", "favorites"],
    },
    referer: "https://www.avito.ru/profile/items",
  });

  if (!response.ok) {
    // 429 rate limit — не фатальная ошибка
    if (response.status === 429) {
      console.warn("[web-client] Stats rate limited (429), will retry next cycle");
      return { items: [] };
    }
    throw new Error(`Avito web stats error: ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();

  // Avito может вернуть разные форматы: массив items или groupings
  const rawItems = data.items ?? data.result?.groupings ?? data.result?.items ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: WebAvitoItemStats[] = rawItems.map((item: any) => {
    // Формат groupings (как V2 API): { id, metrics: [{ slug, value }] }
    if (item.metrics && Array.isArray(item.metrics)) {
      const metricsMap = new Map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        item.metrics.map((m: any) => [m.slug ?? m.name, m.value ?? 0])
      );
      return {
        itemId: item.id ?? item.itemId,
        views: metricsMap.get("views") ?? 0,
        favorites: metricsMap.get("favorites") ?? 0,
        contacts: metricsMap.get("contacts") ?? 0,
      };
    }

    // Плоский формат: { itemId, views, favorites, contacts }
    return {
      itemId: item.id ?? item.itemId ?? 0,
      views: item.views ?? item.uniqViews ?? 0,
      favorites: item.favorites ?? item.addToFavorites ?? 0,
      contacts: item.contacts ?? item.phoneViews ?? 0,
    };
  });

  return { items };
}

// =============================================================================
// Per-item PERIOD stats (просмотры/избранное/контакты за окно дат)
// =============================================================================

export interface WebAvitoItemPeriodStats {
  /** Окно, которое реально вернул сервер (он эхо-ит from/to). */
  from: string | null;
  to: string | null;
  /** Суммы по дням за окно. */
  views: number;
  favorites: number;
  contacts: number;
  impressions: number;
  /** Сырые дневные бакеты {'YYYY-MM-DD': {views,favorites,contacts,impressions,...}} —
   *  для пер-дневного апсёрта в avito_item_stats_daily / спарклайна. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  daily: Record<string, any>;
}

/**
 * Статистика ОДНОГО объявления за период (cookies-flow, без apiKey).
 *
 * Эндпоинт (перехвачен HAR `prosmotr.har`):
 *   POST /web/1/vas/stats
 *   body { itemId: <NUMBER>, from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
 *
 * Ответ — пер-дневной time-series: { from, to, stats: { 'YYYY-MM-DD': {...} } }.
 * Предсуммированных тоталов НЕТ — суммируем дневные бакеты сами.
 *
 * GOTCHAS:
 * - Поле itemId (маленькая d). Сосед /web/1/item/stats/widgets хочет itemID
 *   (большая D) и возвращает {} — это НЕ источник данных.
 * - Даты в BODY (from/to), не в query. Без них сервер отдаёт ~5 последних дней.
 * - Auth — только cookies; apiKey НЕ нужен (не гейтим на session.apiKey).
 */
export async function fetchAvitoItemStatsPeriod(
  session: BrowserSession,
  itemId: number,
  opts?: { from?: string; to?: string }
): Promise<WebAvitoItemPeriodStats | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = { itemId: Number(itemId) };
  if (opts?.from) body.from = opts.from;
  if (opts?.to) body.to = opts.to;

  const response = await avitoWebFetch("/web/1/vas/stats", session, {
    method: "POST",
    body,
    referer: `https://www.avito.ru/profile/items/statistics`,
  });
  if (!response.ok) {
    if (response.status === 429) {
      console.warn("[web-client] vas/stats rate limited (429)");
      return null;
    }
    throw new Error(`Avito vas/stats ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json().catch(() => null);
  if (!data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats: Record<string, any> = data.stats ?? {};
  const days = Object.values(stats);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum = (k: string) => days.reduce((a: number, d: any) => a + (Number(d?.[k]) || 0), 0);

  return {
    from: data.from ?? opts?.from ?? null,
    to: data.to ?? opts?.to ?? null,
    views: sum("views"),
    favorites: sum("favorites"),
    contacts: sum("contacts"),
    impressions: sum("impressions"),
    daily: stats,
  };
}

// =============================================================================
// Wallet / Operations history (аванс/расход — money.har)
// =============================================================================

export interface WebAvitoOperation {
  amountRub: number;
  amountBonus: number;
  amountTotal: number;
  isIncrease: boolean;
  operationId: string;
  operationName: string;
  operationType: string;
  /** ISO с +03:00 (Москва). */
  paidAt: string;
  paymentMethod: string;
  paymentMethodId: number;
}

/**
 * Журнал операций кошелька (cookies-flow, без apiKey).
 *
 * Эндпоинт (перехвачен HAR `money.har`):
 *   GET /web/1/operations-history?dateTimeFrom={ISO}&dateTimeTo={ISO}&limit&offset&isIncrease
 *
 * Даты — ISO-8601 UTC (Z). isIncrease=false → списания (расход), true → пополнения.
 * Тела ответа: { operations: [...] }. Поля total/hasMore НЕТ — пагинация по
 * limit/offset, останавливаемся когда страница вернула < limit строк.
 *
 * ВАЖНО: баланс («аванс») этот эндпоинт НЕ отдаёт — в HAR его не было
 * (рендерится в HTML страницы /account/history). Для баланса нужен отдельный
 * захват wallet-страницы. Здесь — только расход/ledger.
 */
export async function fetchAvitoOperationsHistory(
  session: BrowserSession,
  opts: {
    dateFrom: string;
    dateTo: string;
    limit?: number;
    offset?: number;
    isIncrease?: boolean;
  }
): Promise<{ operations: WebAvitoOperation[] }> {
  const params = new URLSearchParams({
    dateTimeFrom: opts.dateFrom,
    dateTimeTo: opts.dateTo,
    limit: String(opts.limit ?? 100),
    offset: String(opts.offset ?? 0),
  });
  if (opts.isIncrease != null) params.set("isIncrease", String(opts.isIncrease));

  const response = await avitoWebFetch(`/web/1/operations-history?${params}`, session, {
    referer: "https://www.avito.ru/account/history",
  });
  if (!response.ok) {
    throw new Error(`Avito operations-history ${response.status}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json().catch(() => null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops = (data?.operations ?? []) as any[];
  const operations: WebAvitoOperation[] = ops.map((o) => ({
    amountRub: Number(o.amountRub) || 0,
    amountBonus: Number(o.amountBonus) || 0,
    amountTotal: Number(o.amountTotal) || 0,
    isIncrease: Boolean(o.isIncrease),
    operationId: String(o.operationId ?? ""),
    operationName: o.operationName ?? "",
    operationType: o.operationType ?? "",
    paidAt: o.paidAt ?? "",
    paymentMethod: o.paymentMethod ?? "",
    paymentMethodId: Number(o.paymentMethodId) || 0,
  }));
  return { operations };
}

/** Ключевые слова платных услуг продвижения Avito (канон из
 *  jobs/handlers/sync-avito-balance.ts) + operationType-коды. operationType
 *  стабильнее локализованного operationName, поэтому проверяем его первым. */
const AVITO_PROMO_KEYWORDS = [
  "продвиж", "выделен", "поднят", "xl", "просмотр", "реклам",
  "vas", "пакет", "размещени", "услуг", "тариф", "буст", "турбо",
];
const AVITO_PROMO_TYPES = [
  "vas", "promotion", "promo", "highlight", "xl", "turbo", "raise", "premium", "boost",
];

/**
 * Классификатор: является ли операция кошелька ПЛАТНЫМ ПРОДВИЖЕНИЕМ.
 * Универсально для любого акка: в operations-history летят ещё комиссии,
 * выводы, тарифы, списания бонусов — их в «расход на продвижение» брать нельзя.
 * (money.har тестового акка содержал только written_off_directly_bonuses —
 * настоящий вокабуляр промо-типов узнаем с первого боевого акка, поэтому
 * фильтр пермиссивный: тип ИЛИ ключевое слово в имени.)
 */
export function isAvitoPromoOperation(operationName?: string, operationType?: string): boolean {
  const t = (operationType ?? "").toLowerCase();
  if (t && AVITO_PROMO_TYPES.some((k) => t.includes(k))) return true;
  const n = (operationName ?? "").toLowerCase();
  return AVITO_PROMO_KEYWORDS.some((k) => n.includes(k));
}

/** Московский календарный день из ISO — через Intl (не строковый срез:
 *  paidAt может прийти в UTC Z, тогда срез сдвинул бы поздневечерние МСК-операции
 *  на день назад). */
function mskDayOf(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(iso));
  } catch {
    return (iso || "").slice(0, 10);
  }
}

/**
 * Сумма расхода ПРОДВИЖЕНИЯ по дням за окно (Москва-локальный день).
 * Тянет все страницы operations-history (isIncrease=false), фильтрует ТОЛЬКО
 * промо-операции с реальным рублёвым расходом (amountRub>0; бонусы — не деньги),
 * бакетит по московскому дню. Возвращает Map<date, rub>. GROSS (возвраты промо,
 * isIncrease=true, не вычитаются — редкий кейс).
 */
export async function fetchAvitoPromoSpendByDay(
  session: BrowserSession,
  dateFromIso: string,
  dateToIso: string
): Promise<Map<string, number>> {
  const byDay = new Map<string, number>();
  const limit = 100;
  let offset = 0;
  // Бэкстоп: не более 20 страниц (2000 операций) на цикл.
  for (let page = 0; page < 20; page++) {
    const { operations } = await fetchAvitoOperationsHistory(session, {
      dateFrom: dateFromIso,
      dateTo: dateToIso,
      limit,
      offset,
      isIncrease: false,
    });
    for (const op of operations) {
      if (op.isIncrease) continue;
      if (!(op.amountRub > 0)) continue; // бонус-burn / нулевые — не расход
      if (!isAvitoPromoOperation(op.operationName, op.operationType)) continue;
      const day = mskDayOf(op.paidAt);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + op.amountRub);
    }
    if (operations.length < limit) break;
    offset += limit;
  }
  return byDay;
}

// =============================================================================
// Chats (мессенджер)
// =============================================================================

export interface WebAvitoChat {
  id: string;
  buyerName: string | null;
  buyerAvitoId: number | null;
  itemId: number | null;
  itemTitle: string | null;
  itemPrice: number | null;
  itemUrl: string | null;
  itemImageUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null; // ISO string
  lastMessageDirection: "in" | "out" | null;
  unreadCount: number;
}

export interface WebAvitoChatsResponse {
  chats: WebAvitoChat[];
  hasMore: boolean;
}

/**
 * Вытаскивает текст последнего сообщения из getChannels.lastMessage.
 * Разные типы дают разную форму: системные/ассистент → preview.text (строка),
 * обычный текст покупателя → body.text / body.composite.text как ОБЪЕКТ {text}.
 * Пробуем все кандидаты, разворачивая вложенный .text.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLastMessageText(last: any): string | null {
  if (!last) return null;
  const candidates = [
    last.preview?.text,
    last.body?.composite?.text,
    last.body?.text,
    last.content?.text,
    last.text,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
    if (c && typeof c === "object" && typeof c.text === "string" && c.text) return c.text;
  }
  return null;
}

/**
 * Получить список чатов (cookies-flow, без apiKey).
 *
 * Эндпоинт (перехвачен HAR `message.har`):
 *   POST /web/1/messenger/getChannels
 *   body { limit, filters:{excludeTags:[2,3],anyTags:[]}, offsetTimestamp, category:1 }
 *
 * Старые пути /web/1/messenger/dialog и /chats/* теперь отдают 404.
 * Ответ: { success: { channels: [...], hasMore } }.
 *
 * GOTCHAS:
 * - createdAt/sortingTimestamp — НАНОСЕКУНДЫ (19 цифр), делим на 1e6 → ms.
 * - Числового бейджа непрочитанных нет: unread = isRead===false → 1.
 * - Контрагент (покупатель) = channel.info.name; его id только хешированный.
 * - Системные чаты (Ассистент Авито) идут без context.item — их пропускаем.
 * - Пагинация: курсор — минимальный sortingTimestamp прошлой страницы (desc),
 *   передаётся как offsetTimestamp.
 */
export async function fetchAvitoChats(
  session: BrowserSession,
  limit: number = 100,
  offsetTimestamp: number = 0
): Promise<WebAvitoChatsResponse> {
  const response = await avitoWebFetch("/web/1/messenger/getChannels", session, {
    method: "POST",
    body: {
      limit,
      filters: { excludeTags: [2, 3], anyTags: [] },
      offsetTimestamp,
      category: 1,
    },
    referer: "https://www.avito.ru/profile/messenger",
  });

  if (!response.ok) {
    throw new Error(`Avito web chats error: ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawChannels: any[] = data?.success?.channels ?? data?.channels ?? [];

  const chats: WebAvitoChat[] = [];
  for (const ch of rawChannels) {
    const item = ch?.context?.item?.value?.item ?? null;
    // Системный/сервисный чат (Ассистент Авито и т.п.) — без объявления, пропускаем.
    if (!item && ch?.context?.system) continue;

    const ownerId = ch?.userId ?? null;
    const last = ch?.lastMessage ?? null;
    let lastMessageAt: string | null = null;
    if (last?.createdAt) {
      // НАНОСЕКУНДЫ → миллисекунды.
      const ms = Number(last.createdAt) / 1e6;
      if (Number.isFinite(ms) && ms > 0) lastMessageAt = new Date(ms).toISOString();
    }
    const direction: "in" | "out" | null = last?.authorId
      ? last.authorId === ownerId
        ? "out"
        : "in"
      : null;

    // У покупателя только хешированный id → в числовую колонку кладём null.
    const bidNum = Number(ch?.info?.userId);

    let itemImageUrl: string | null = null;
    const mainImg = item?.images?.main;
    if (mainImg && typeof mainImg === "object") {
      const raw = mainImg["140x105"] ?? mainImg["240x180"] ?? Object.values(mainImg).find((v) => typeof v === "string");
      if (typeof raw === "string") itemImageUrl = raw.startsWith("//") ? "https:" + raw : raw;
    }

    chats.push({
      id: String(ch?.id ?? ""),
      buyerName: ch?.info?.name ?? null,
      buyerAvitoId: Number.isFinite(bidNum) ? bidNum : null,
      itemId: item?.id ?? null,
      itemTitle: item?.title ?? null,
      itemPrice: typeof item?.price === "number" ? item.price : null,
      itemUrl: item?.id ? `https://www.avito.ru/${item.id}` : null,
      itemImageUrl,
      lastMessage: extractLastMessageText(last),
      lastMessageAt,
      lastMessageDirection: direction,
      unreadCount: ch?.isRead === false ? 1 : 0,
    });
  }

  return {
    chats,
    hasMore: Boolean(data?.success?.hasMore),
  };
}

// =============================================================================
// Chat Messages
// =============================================================================

export interface WebAvitoChatMessage {
  id: string;
  authorId: number;
  created: number; // unix timestamp
  type: string; // text | image | system | etc.
  text: string | null;
  imageUrl: string | null;
  direction: "in" | "out";
}

/**
 * Получить сообщения чата (cookies-flow).
 * Эндпоинт (канон из message.har): POST /web/1/messenger/getUserVisibleMessages
 *   body { channelId, limit, order:0 }. Старый /chats/{id}/messages отдаёт 404.
 *
 * Метки времени приходят в наносекундах (как и в getChannels) — нормализуем
 * к unix-секундам с автоопределением масштаба (ns / ms / s / ISO).
 */
export async function fetchAvitoChatMessages(
  session: BrowserSession,
  chatId: string,
  limit: number = 30,
  /** Числовой Avito-id владельца акка (avito_browser_sessions.avito_user_id) —
   *  нужен для direction: сообщение от него = "out", иначе "in". */
  ownerId?: number | string | null
): Promise<WebAvitoChatMessage[]> {
  const response = await avitoWebFetch("/web/1/messenger/getUserVisibleMessages", session, {
    method: "POST",
    body: { channelId: chatId, limit, order: 0 },
    referer: `https://www.avito.ru/profile/messenger/channel/${chatId}`,
  });

  if (!response.ok) {
    throw new Error(`Avito web messages error: ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();

  const rawMessages =
    data?.success?.messages ?? data?.messages ?? data?.result?.messages ?? [];

  // Приводит любое представление времени к unix-секундам.
  const toUnixSeconds = (raw: unknown): number => {
    if (typeof raw === "number") {
      if (raw > 1e17) return Math.floor(raw / 1e9); // наносекунды
      if (raw > 1e14) return Math.floor(raw / 1e6); // микро/мс*1000
      if (raw > 1e11) return Math.floor(raw / 1e3); // миллисекунды
      return Math.floor(raw); // секунды
    }
    const t = new Date(String(raw)).getTime();
    return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
  };

  // Текст: тип 1 — body.text.text; тип 10 (Ассистент Авито) — composite.chunks[]
  // (в body.composite.text лежит ЗАГЛУШКА «Сообщение не поддерживается», её НЕ
  // берём — собираем настоящий текст из chunks). Прочие — preview/content.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickText = (msg: any): string | null => {
    // composite (ассистент, тип 10): текст в chunks, а не в composite.text.
    const chunks = msg.body?.composite?.chunks;
    if (Array.isArray(chunks)) {
      const parts = chunks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((ch: any) =>
          typeof ch?.text?.text === "string"
            ? ch.text.text
            : typeof ch?.text === "string"
              ? ch.text
              : null
        )
        .filter((t: unknown): t is string => typeof t === "string" && t.length > 0);
      if (parts.length) return parts.join("\n\n");
    }
    const c = [
      msg.body?.text?.text,
      typeof msg.body?.text === "string" ? msg.body.text : null,
      msg.preview?.text,
      msg.content?.text,
      typeof msg.text === "string" ? msg.text : null,
      // composite.text — заглушка Avito; используем лишь как самый последний фолбэк.
      msg.body?.composite?.text,
    ];
    for (const v of c) if (typeof v === "string" && v) return v;
    return null;
  };

  const owner = ownerId != null ? String(ownerId) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rawMessages.map((msg: any): WebAvitoChatMessage => {
    // author_id колонка BIGINT — берём ЧИСЛОВОЙ originalAuthorId (authorId хеширован).
    const numAuthor = Number(msg.originalAuthorId ?? msg.author_id ?? 0) || 0;
    const direction: "in" | "out" =
      owner && String(numAuthor) === owner ? "out" : "in";
    return {
      id: String(msg.id ?? msg.messageId ?? ""),
      authorId: numAuthor,
      created: toUnixSeconds(msg.createdAt ?? msg.created),
      type: String(msg.type ?? "text"),
      text: pickText(msg),
      imageUrl:
        msg.body?.image?.url ??
        msg.body?.image?.sizes?.["1280x960"] ??
        msg.content?.image?.url ??
        null,
      direction,
    };
  });
}

// =============================================================================
// API key extraction (ТЗ §15.9)
// =============================================================================

/**
 * Извлекает Avito per-user apiKey из HTML главной orders-страницы.
 *
 * Avito прокидывает key в нескольких местах initial state HTML:
 *   - <script>...__INITIAL_STATE__...key:"af0..."...</script>
 *   - <meta name="avito-api-key" content="...">
 *   - data-key="..." на корневом контейнере
 *
 * Helper пробует все известные паттерны и возвращает первый матч.
 * Возвращает null если ни один не совпал (логин действительно успешен,
 * но Avito поменял место хранения — нужно расширить regex).
 */
export async function fetchAvitoApiKey(session: BrowserSession): Promise<string | null> {
  try {
    const response = await avitoWebFetch("/orders", session, {
      referer: "https://www.avito.ru/profile",
      method: "GET",
    });
    if (!response.ok) return null;
    const html = await response.text();
    return extractApiKeyFromHtml(html);
  } catch {
    return null;
  }
}

/** Чистая функция извлечения — тестируется без сетевого вызова. */
export function extractApiKeyFromHtml(html: string): string | null {
  if (!html) return null;
  // Паттерны от самого специфичного к самому широкому.
  const patterns: RegExp[] = [
    /["']avito[-_]?api[-_]?key["']\s*[:=]\s*["']([a-z0-9]{30,80})["']/i,
    /["']apiKey["']\s*:\s*["']([a-z0-9]{30,80})["']/,
    /["']key["']\s*:\s*["'](af[a-z0-9]{30,80})["']/,
    /<meta\s+name=["']avito[-_]?api[-_]?key["']\s+content=["']([a-z0-9]{30,80})["']/i,
    /data-api-key=["']([a-z0-9]{30,80})["']/i,
    // Самый широкий — длинный alnum токен, начинающийся с 'af' (как
    // в HAR: af0deccbg...). Только если предыдущие не сработали.
    /\baf[0-9a-z]{38,50}\b/,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return m[1] ?? m[0];
  }
  return null;
}

// =============================================================================
// Profile Order Detail (BeduinUI m.avito.ru, ТЗ §15.3)
// =============================================================================

/**
 * Получает детали заказа из мобильного BeduinUI-API.
 * Эндпоинт обнаружен по HAR: GET /api/2/profile/order?referenceID={id}&location=Europe/Moscow
 *
 * Ответ содержит buyer.name, priceBlock с комиссией Avito, messagesDeeplink с chat_id.
 * Парсится через `parseAvitoOrderDetail` (см. order-detail-parser.ts).
 */
export async function fetchAvitoOrderProfileDetail(
  session: BrowserSession,
  referenceID: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  if (!session.apiKey) return null; // нет токена — endpoint вернёт 401
  const path = `/api/2/profile/order?key=${encodeURIComponent(session.apiKey)}&referenceID=${encodeURIComponent(referenceID)}&location=Europe%2FMoscow`;
  // Хост m.avito.ru (мобильный), но мы переиспользуем avitoWebFetch
  // (он привязан к www.avito.ru). На случай несовместимости — fallback вручную.
  try {
    const response = await avitoWebFetch(path, session, {
      referer: `https://m.avito.ru/orders`,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Получает журнал переходов статусов заказа.
 * Эндпоинт: GET /api/2/order-log?orderId={id}&location=Europe/Moscow
 *
 * Ответ содержит orderHistoryItems[] с icon/titleItems/date — это
 * полный таймлайн от создания до завершения, с timestamp'ами в формате
 * "HH:MM D месяц". Парсится через parseAvitoOrderLog.
 */
export async function fetchAvitoOrderLog(
  session: BrowserSession,
  orderId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  // /api/2/order-log не требует key (наблюдалось в HAR: запрос без ?key=),
  // но передаём если есть на случай если изменится политика.
  const keyPart = session.apiKey ? `&key=${encodeURIComponent(session.apiKey)}` : "";
  const path = `/api/2/order-log?orderId=${encodeURIComponent(orderId)}${keyPart}&location=Europe%2FMoscow`;
  try {
    const response = await avitoWebFetch(path, session, {
      referer: `https://m.avito.ru/orders`,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// =============================================================================
// Item edit via mobile BeduinUI (m.avito.ru) — без OAuth-подписки
// =============================================================================

/**
 * Меняет цену объявления через мобильный BeduinUI endpoint.
 *
 * Перехвачено HAR: POST https://m.avito.ru/api/19/profile/item/{itemId}/edit?key={apiKey}
 * Content-Type: application/x-www-form-urlencoded
 * Body содержит params[100003]={новая_цена} (полное тело при редактировании в UI
 * содержит 44 поля, но Avito принимает и минимальный пэйлоад со сменой только
 * нужного params[].
 *
 * Возвращает {success, status, body}. Не бросает — все ошибки в результате.
 */
export async function updateAvitoItemPriceViaWeb(
  session: BrowserSession,
  itemId: number,
  newPrice: number
): Promise<{ success: boolean; status: number; body: string; error?: string }> {
  if (!session.apiKey) {
    return { success: false, status: 0, body: "", error: "no apiKey on session" };
  }
  const url = `https://m.avito.ru/api/19/profile/item/${itemId}/edit?key=${encodeURIComponent(session.apiKey)}`;
  // HAR-replay: полный 44-полевой body конкретного объявления (Джинсы zara, id 8191071297).
  // Avito принимает edit только когда передан весь текущий state — navigation,
  // params, slots, version, publishSessionId. Подменяем только params[100003] (цена).
  // Для других объявлений / категорий нужен GET state перед каждой правкой,
  // но как proof-of-concept пробуем чистый replay.
  // Шаг 1: получаем СВЕЖИЕ version + полный navigation через brief?action=edit.
  // Это работает для любого объявления любой категории.
  let briefState: {
    categoryId?: number;
    description?: string;
    title?: string;
    version?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigation?: any;
  } | null = null;
  try {
    const briefUrl = `https://m.avito.ru/api/2/profile/item/${itemId}/brief?key=${encodeURIComponent(session.apiKey)}`;
    const briefHeaders = {
      "User-Agent": session.userAgent,
      Cookie: buildCookieHeader(session.cookies),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9",
      Origin: "https://m.avito.ru",
      Referer: `https://m.avito.ru/profile/item/${itemId}/edit`,
      "Sec-Ch-Ua": buildSecChUa(session.userAgent),
      "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
      "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
    } as Record<string, string>;
    const briefOpts: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers: briefHeaders,
      body: "action=edit",
    };
    if (session.proxyUrl) briefOpts.dispatcher = new ProxyAgent(session.proxyUrl);
    const briefResp = await fetch(briefUrl, briefOpts as RequestInit);
    if (briefResp.ok) {
      briefState = await briefResp.json();
      console.log(`[updateAvitoItemPrice] brief version=${briefState?.version} categoryId=${briefState?.categoryId}`);
    } else {
      console.error(`[updateAvitoItemPrice] brief failed: ${briefResp.status}`);
    }
  } catch (e) {
    console.error("[updateAvitoItemPrice] brief exception:", e);
  }
  if (!briefState || briefState.version == null) {
    return { success: false, status: 0, body: "", error: "no fresh state from /brief" };
  }
  const dynVersion = String(briefState.version);
  // publishSessionId — берём из HTML edit-страницы (он там есть).
  let dynPsid: string | null = null;
  try {
    const editUrl = `https://m.avito.ru/profile/item/${itemId}/edit`;
    const editOpts: RequestInit & { dispatcher?: unknown } = {
      method: "GET",
      headers: {
        "User-Agent": session.userAgent,
        Cookie: buildCookieHeader(session.cookies),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9",
        "Sec-Ch-Ua": buildSecChUa(session.userAgent),
        "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
        "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
      } as Record<string, string>,
      redirect: "follow",
    };
    if (session.proxyUrl) editOpts.dispatcher = new ProxyAgent(session.proxyUrl);
    const editHtml = await (await fetch(editUrl, editOpts as RequestInit)).text();
    const psidMatch = editHtml.match(/&quot;publishSessionId&quot;:&quot;([^&]+)&quot;/);
    if (psidMatch) dynPsid = psidMatch[1];
  } catch (e) {
    console.error("[updateAvitoItemPrice] edit html fetch failed:", e);
  }
  if (!dynPsid) {
    return { success: false, status: 0, body: "", error: "no fresh publishSessionId" };
  }

  // HAR-replay со СВЕЖИМИ version и publishSessionId.
  const HAR_TEMPLATE = "navigation%5Battributes%5D%5B0%5D%5Bid%5D=178&navigation%5Battributes%5D%5B0%5D%5Bvalue%5D=759&navigation%5Battributes%5D%5B1%5D%5Bid%5D=110&navigation%5Battributes%5D%5B1%5D%5Bvalue%5D=403&navigation%5Battributes%5D%5B2%5D%5Bid%5D=166252&navigation%5Battributes%5D%5B2%5D%5Bvalue%5D=3268185&navigation%5BcategoryId%5D=29&navigation%5BcategoryIds%5D%5B0%5D=29&navigation%5Bconfig%5D%5Blayout%5D=mav_edit&navigation%5Bconfig%5D%5Btree%5D=mav&navigation%5BmicrocategoryId%5D=2179580&params%5B110%5D=403&params%5B178%5D=759&params%5B2756%5D=19916&params%5B2827%5D=20032&params%5B2863%5D%5Bjwt%5D=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTQuOTI3MjczLCJsb25naXR1ZGUiOjM3LjQwMjc5NCwiYWRkcmVzcyI6ItCc0L7RgdC60L7QstGB0LrQsNGPINC-0LHQu9Cw0YHRgtGMLCDQodC10YDQv9GD0YXQvtCyLCDQnNC-0YHQutC-0LLRgdC60L7QtSDRiNC-0YHRgdC1LCA0MSIsImFkZHJlc3NJZCI6MTQ2NTc0LCJsb2NhdGlvbklkIjo2Mzk0NzAsImlzU3VnZ2VzdCI6ZmFsc2UsImlzU2VsbGVyQWRkcmVzcyI6ZmFsc2V9.pz8LaGTFWDSZ80NWc2euD9ZX33rOZOSReNOyz77-b2c&params%5B2863%5D%5Blat%5D=54.927273&params%5B2863%5D%5Blng%5D=37.402794&params%5B2863%5D%5Btext%5D=%D0%9C%D0%BE%D1%81%D0%BA%D0%BE%D0%B2%D1%81%D0%BA%D0%B0%D1%8F+%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C%2C+%D0%A1%D0%B5%D1%80%D0%BF%D1%83%D1%85%D0%BE%D0%B2%2C+%D0%9C%D0%BE%D1%81%D0%BA%D0%BE%D0%B2%D1%81%D0%BA%D0%BE%D0%B5+%D1%88%D0%BE%D1%81%D1%81%D0%B5%2C+41&params%5B100001%5D=%D0%94%D0%B6%D0%B8%D0%BD%D1%81%D1%8B+zara&params%5B100002%5D=%D1%85%D0%BE%D1%80%D0%BE%D1%88%D0%B8%D0%B5+%D0%B4%D0%B6%D0%B8%D0%BD%D1%81%D1%8B&params%5B100003%5D=__PRICE__&params%5B100004%5D%5B0%5D=54019633464&params%5B112674%5D=754146&params%5B115576%5D=1507916&params%5B115634%5D=1689235&params%5B164867%5D%5B0%5D=3263859&params%5B165436%5D%5B0%5D=3265831&params%5B166252%5D=3268185&params%5B171955%5D=3280748&params%5B183445%5D=1&params%5B185281%5D=3342684&params%5B187331%5D=1&params%5B192386%5D=1&slots%5B13213589%5D%5BstockMultiple%5D=false&slots%5B13213589%5D%5BstockQuantity%5D=&slots%5B13213708%5D%5Bphone%5D=%2B7+985+189-80-29&slots%5B13213724%5D%5BcontactMethod%5D=any&slots%5B13213737%5D%5BiacDevices%5D%5B0%5D=2CE28A1D-3647-4484-AFAA-71F3A4E4C0B5&slots%5B13213737%5D%5BiacProChosen%5D=false&slots%5B13213750%5D%5BautoPublish%5D=false&categoryId=29&version=__VERSION__&publishSessionId=__PSID__";
  const body = HAR_TEMPLATE
    .replace("__PRICE__", encodeURIComponent(String(newPrice)))
    .replace("__VERSION__", dynVersion)
    .replace("__PSID__", encodeURIComponent(dynPsid));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = {
      "User-Agent": session.userAgent,
      Cookie: buildCookieHeader(session.cookies),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9",
      Origin: "https://m.avito.ru",
      Referer: `https://m.avito.ru/profile/item/${itemId}/edit`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Ch-Ua": buildSecChUa(session.userAgent),
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
    } as Record<string, string>;

    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    };
    if (session.proxyUrl) {
      fetchOptions.dispatcher = new ProxyAgent(session.proxyUrl);
    }

    const response = await fetch(url, fetchOptions as RequestInit);
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      return { success: false, status: response.status, body: text, error: "session expired" };
    }
    if (!response.ok) {
      return { success: false, status: response.status, body: text, error: `HTTP ${response.status}` };
    }
    try {
      const parsed = JSON.parse(text);
      const ok = parsed?.status === "ok";
      return ok
        ? { success: true, status: response.status, body: text }
        : { success: false, status: response.status, body: text, error: parsed?.error?.message || "not ok" };
    } catch {
      return { success: false, status: response.status, body: text, error: "non-JSON response" };
    }
  } catch (e) {
    return {
      success: false,
      status: 0,
      body: "",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// Item stop (снять с публикации) через mobile BeduinUI
// =============================================================================

/**
 * Снимает объявление с публикации.
 *
 * Перехвачено HAR: POST https://m.avito.ru/api/3/profile/item/{id}/stop?key=...
 * Body: reason={N} (form-urlencoded). reason=9 — стандартный «больше не актуально».
 * Response: {"result":{"message":"Объявление снято с публикации"},"status":"ok"}
 */
export async function stopAvitoItemViaWeb(
  session: BrowserSession,
  itemId: number,
  reason: number = 9
): Promise<{ success: boolean; status: number; body: string; error?: string }> {
  if (!session.apiKey) {
    return { success: false, status: 0, body: "", error: "no apiKey on session" };
  }
  const url = `https://m.avito.ru/api/3/profile/item/${itemId}/stop?key=${encodeURIComponent(session.apiKey)}`;
  const body = `reason=${encodeURIComponent(String(reason))}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = {
      "User-Agent": session.userAgent,
      Cookie: buildCookieHeader(session.cookies),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9",
      Origin: "https://m.avito.ru",
      Referer: `https://m.avito.ru/profile/item/${itemId}`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Ch-Ua": buildSecChUa(session.userAgent),
      "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
      "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
    } as Record<string, string>;
    const opts: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    };
    if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);
    const response = await fetch(url, opts as RequestInit);
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      return { success: false, status: response.status, body: text, error: "session expired" };
    }
    if (!response.ok) {
      return { success: false, status: response.status, body: text, error: `HTTP ${response.status}` };
    }
    try {
      const parsed = JSON.parse(text);
      const ok = parsed?.status === "ok";
      return ok
        ? { success: true, status: response.status, body: text }
        : { success: false, status: response.status, body: text, error: parsed?.error?.message || "not ok" };
    } catch {
      return { success: false, status: response.status, body: text, error: "non-JSON response" };
    }
  } catch (e) {
    return { success: false, status: 0, body: "", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Полностью удаляет объявление (из архива «Снято с публикации»).
 * Применимо только к уже остановленным (inactive) объявлениям.
 *
 * Перехвачено HAR: POST https://m.avito.ru/api/2/profile/item/{id}/delete?key=...
 * Content-Type: application/json, body: {}
 * Response: {"message":"Объявление удалено","success":true}
 */
export async function deleteAvitoItemViaWeb(
  session: BrowserSession,
  itemId: number
): Promise<{ success: boolean; status: number; body: string; error?: string }> {
  if (!session.apiKey) {
    return { success: false, status: 0, body: "", error: "no apiKey on session" };
  }
  const url = `https://m.avito.ru/api/2/profile/item/${itemId}/delete?key=${encodeURIComponent(session.apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = {
      "User-Agent": session.userAgent,
      Cookie: buildCookieHeader(session.cookies),
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9",
      Origin: "https://m.avito.ru",
      Referer: `https://m.avito.ru/profile/items/inactive`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Ch-Ua": buildSecChUa(session.userAgent),
      "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
      "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
    } as Record<string, string>;
    const opts: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers,
      body: "{}",
      signal: controller.signal,
    };
    if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);
    const response = await fetch(url, opts as RequestInit);
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      return { success: false, status: response.status, body: text, error: "session expired" };
    }
    if (!response.ok) {
      return { success: false, status: response.status, body: text, error: `HTTP ${response.status}` };
    }
    try {
      const parsed = JSON.parse(text);
      const ok = parsed?.success === true;
      return ok
        ? { success: true, status: response.status, body: text }
        : { success: false, status: response.status, body: text, error: parsed?.message || "not ok" };
    } catch {
      return { success: false, status: response.status, body: text, error: "non-JSON response" };
    }
  } catch (e) {
    return { success: false, status: 0, body: "", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// Submit listing (создать объявление) через cookies-flow www.avito.ru
// =============================================================================

/**
 * Пул из 12 станций Коричневой кольцевой Москвы (ТЗ).
 * Каждая запись — полный geo-блок с серверной JWT-подписью geoFieldsHash,
 * извлечённый из HAR `metro.har` (POST /js/v2/geo/position).
 * На каждое объявление берётся random запись из этого пула.
 */
const BROWN_RING_METROS: ReadonlyArray<{
  name: string;
  address: string;
  addressId: number;
  locationId: number;
  metroId: number;
  districtId: number;
  lat: number;
  lng: number;
  geoFieldsHash: string;
}> = [
  { name: "Парк культуры", address: "Москва, Кольцевая линия, метро Парк культуры", addressId: 1074116, locationId: 637640, metroId: 82, districtId: 724, lat: 55.735307, lng: 37.592869, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzM1MzA3LCJsb25naXR1ZGUiOjM3LjU5Mjg2OSwiYWRkcmVzcyI6ItCc0L7RgdC60LLQsCwg0JrQvtC70YzRhtC10LLQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0J_QsNGA0Log0LrRg9C70YzRgtGD0YDRiyIsImFkZHJlc3NJZCI6MTA3NDExNiwibG9jYXRpb25JZCI6NjM3NjQwLCJtZXRyb0lkIjo4MiwiZGlzdHJpY3RJZCI6NzI0fQ.aCtD9lBTitVplFeWAEAsjkt5FTXSjaZjNgwLj40eFTE" },
  { name: "Октябрьская", address: "Москва, Кольцевая линия, метро Октябрьская", addressId: 1063638, locationId: 637640, metroId: 75, districtId: 738, lat: 55.729219, lng: 37.611185, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzI5MjE5LCJsb25naXR1ZGUiOjM3LjYxMTE4NSwiYWRkcmVzcyI6ItCc0L7RgdC60LLQsCwg0JrQvtC70YzRhtC10LLQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0J7QutGC0Y_QsdGA0YzRgdC60LDRjyIsImFkZHJlc3NJZCI6MTA2MzYzOCwibG9jYXRpb25JZCI6NjM3NjQwLCJtZXRyb0lkIjo3NSwiZGlzdHJpY3RJZCI6NzM4fQ.GOYrar3NF_03mnGRXQuk-152Iu_I9naxULyVAsnH0Lc" },
  { name: "Добрынинская", address: "Москва, Кольцевая линия, метро Добрынинская", addressId: 1122339, locationId: 637640, metroId: 32, districtId: 645, lat: 55.728996, lng: 37.622747, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzI4OTk2LCJsb25naXR1ZGUiOjM3LjYyMjc0NywiYWRkcmVzcyI6ItCc0L7RgdC60LLQsCwg0JrQvtC70YzRhtC10LLQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0JTQvtCx0YDRi9C90LjQvdGB0LrQsNGPIiwiYWRkcmVzc0lkIjoxMTIyMzM5LCJsb2NhdGlvbklkIjo2Mzc2NDAsIm1ldHJvSWQiOjMyLCJkaXN0cmljdElkIjo2NDV9.SO4CmvJDi99JOaqUQkfACCSdLbuTBXtdwjVD3BGuH-A" },
  { name: "Павелецкая", address: "Москва, Замоскворецкая линия, метро Павелецкая", addressId: 2852550, locationId: 637640, metroId: 80, districtId: 645, lat: 55.73001, lng: 37.638413, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzMwMDEsImxvbmdpdHVkZSI6MzcuNjM4NDEzLCJhZGRyZXNzIjoi0JzQvtGB0LrQstCwLCDQl9Cw0LzQvtGB0LrQstC-0YDQtdGG0LrQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0J_QsNCy0LXQu9C10YbQutCw0Y8iLCJhZGRyZXNzSWQiOjI4NTI1NTAsImxvY2F0aW9uSWQiOjYzNzY0MCwibWV0cm9JZCI6ODAsImRpc3RyaWN0SWQiOjY0NX0.SFmd9w_COPkV8cn6JwRuvUS5sOkQmoKUp0FXFEB8lXM" },
  { name: "Таганская", address: "Москва, Таганско-Краснопресненская линия, метро Таганская", addressId: 1075240, locationId: 637640, metroId: 62, districtId: 716, lat: 55.739549, lng: 37.652957, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzM5NTQ5LCJsb25naXR1ZGUiOjM3LjY1Mjk1NywiYWRkcmVzcyI6ItCc0L7RgdC60LLQsCwg0KLQsNCz0LDQvdGB0LrQvi3QmtGA0LDRgdC90L7Qv9GA0LXRgdC90LXQvdGB0LrQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0KLQsNCz0LDQvdGB0LrQsNGPIiwiYWRkcmVzc0lkIjoxMDc1MjQwLCJsb2NhdGlvbklkIjo2Mzc2NDAsIm1ldHJvSWQiOjYyLCJkaXN0cmljdElkIjo3MTZ9.0DZ5Jmx0_ayir7Hmns7TUoZWlClzQcY_QQmA0P5Bw3E" },
  { name: "Курская", address: "Москва, Кольцевая линия, метро Курская", addressId: 1869881, locationId: 637640, metroId: 57, districtId: 622, lat: 55.75745, lng: 37.659937, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzU3NDUsImxvbmdpdHVkZSI6MzcuNjU5OTM3LCJhZGRyZXNzIjoi0JzQvtGB0LrQstCwLCDQmtC-0LvRjNGG0LXQstCw0Y8g0LvQuNC90LjRjywg0LzQtdGC0YDQviDQmtGD0YDRgdC60LDRjyIsImFkZHJlc3NJZCI6MTg2OTg4MSwibG9jYXRpb25JZCI6NjM3NjQwLCJtZXRyb0lkIjo1NywiZGlzdHJpY3RJZCI6NjIyfQ.7MECjHJarWNbSSQrfASIEbZH64XEkXIaYTUpSKR-GsI" },
  { name: "Комсомольская", address: "Москва, Кольцевая линия, метро Комсомольская", addressId: 1122713, locationId: 637640, metroId: 45, districtId: 656, lat: 55.775707, lng: 37.6547, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzc1NzA3LCJsb25naXR1ZGUiOjM3LjY1NDcsImFkZHJlc3MiOiLQnNC-0YHQutCy0LAsINCa0L7Qu9GM0YbQtdCy0LDRjyDQu9C40L3QuNGPLCDQvNC10YLRgNC-INCa0L7QvNGB0L7QvNC-0LvRjNGB0LrQsNGPIiwiYWRkcmVzc0lkIjoxMTIyNzEzLCJsb2NhdGlvbklkIjo2Mzc2NDAsIm1ldHJvSWQiOjQ1LCJkaXN0cmljdElkIjo2NTZ9.RBFnLUEnd4xI1lt3G5QVzlwZKEv_vYXiEUYOfJT0UBg" },
  { name: "Проспект Мира", address: "Москва, Кольцевая линия, метро Проспект Мира", addressId: 1267908, locationId: 637640, metroId: 97, districtId: 673, lat: 55.779636, lng: 37.633473, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzc5NjM2LCJsb25naXR1ZGUiOjM3LjYzMzQ3MywiYWRkcmVzcyI6ItCc0L7RgdC60LLQsCwg0JrQvtC70YzRhtC10LLQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0J_RgNC-0YHQv9C10LrRgiDQnNC40YDQsCIsImFkZHJlc3NJZCI6MTI2NzkwOCwibG9jYXRpb25JZCI6NjM3NjQwLCJtZXRyb0lkIjo5NywiZGlzdHJpY3RJZCI6NjczfQ.cmuCQUsHxiXyP_MlQ3azzDAANVQ47TQbuxu2l7Jtxoo" },
  { name: "Новослободская", address: "Москва, Кольцевая линия, метро Новослободская", addressId: 1060396, locationId: 637640, metroId: 73, districtId: 717, lat: 55.779565, lng: 37.601421, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzc5NTY1LCJsb25naXR1ZGUiOjM3LjYwMTQyMSwiYWRkcmVzcyI6ItCc0L7RgdC60LLQsCwg0JrQvtC70YzRhtC10LLQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0J3QvtCy0L7RgdC70L7QsdC-0LTRgdC60LDRjyIsImFkZHJlc3NJZCI6MTA2MDM5NiwibG9jYXRpb25JZCI6NjM3NjQwLCJtZXRyb0lkIjo3MywiZGlzdHJpY3RJZCI6NzE3fQ.3Qin13WRKKXEyzxL_1Gwk4p588Gd-6UBzCwaKYBcupQ" },
  { name: "Белорусская", address: "Москва, Кольцевая линия, метро Белорусская", addressId: 1227582, locationId: 637640, metroId: 13, districtId: 717, lat: 55.776775, lng: 37.58526, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzc2Nzc1LCJsb25naXR1ZGUiOjM3LjU4NTI2LCJhZGRyZXNzIjoi0JzQvtGB0LrQstCwLCDQmtC-0LvRjNGG0LXQstCw0Y8g0LvQuNC90LjRjywg0LzQtdGC0YDQviDQkdC10LvQvtGA0YPRgdGB0LrQsNGPIiwiYWRkcmVzc0lkIjoxMjI3NTgyLCJsb2NhdGlvbklkIjo2Mzc2NDAsIm1ldHJvSWQiOjEzLCJkaXN0cmljdElkIjo3MTd9.CURHwYkpkCrt2N-VMZiY0_n6PHdC0ll2sLLZPOxLKUY" },
  { name: "Краснопресненская", address: "Москва, Кольцевая линия, метро Краснопресненская", addressId: 1073505, locationId: 637640, metroId: 48, districtId: 696, lat: 55.760216, lng: 37.57722, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzYwMjE2LCJsb25naXR1ZGUiOjM3LjU3NzIyLCJhZGRyZXNzIjoi0JzQvtGB0LrQstCwLCDQmtC-0LvRhtC10LLQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0JrRgNCw0YHQvdC-0L_RgNC10YHQvdC10L3RgdC60LDRjyIsImFkZHJlc3NJZCI6MTA3MzUwNSwibG9jYXRpb25JZCI6NjM3NjQwLCJtZXRyb0lkIjo0OCwiZGlzdHJpY3RJZCI6Njk2fQ.v0Ejubk35U8XpQf3oaot5pu832jiw7uyEprMX_kBaWI" },
  { name: "Киевская", address: "Москва, Кольцевая линия, метро Киевская", addressId: 1147279, locationId: 637640, metroId: 41, districtId: 644, lat: 55.743928, lng: 37.568102, geoFieldsHash: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYXRpdHVkZSI6NTUuNzQzOTI4LCJsb25naXR1ZGUiOjM3LjU2ODEwMiwiYWRkcmVzcyI6ItCc0L7RgdC60LLQsCwg0JrQvtC70YzRhtC10LLQsNGPINC70LjQvdC40Y8sINC80LXRgtGA0L4g0JrQuNC10LLRgdC60LDRjyIsImFkZHJlc3NJZCI6MTE0NzI3OSwibG9jYXRpb25JZCI6NjM3NjQwLCJtZXRyb0lkIjo0MSwiZGlzdHJpY3RJZCI6NjQ0fQ.rBJxfWnNWBuoEVPMuuDr6iQCL7FrdJsLC7UnE9j4V0Y" },
];

function pickBrownRingMetro(): typeof BROWN_RING_METROS[number] {
  return BROWN_RING_METROS[Math.floor(Math.random() * BROWN_RING_METROS.length)];
}

/**
 * Получает JWT для указанного московского метро через
 * /api/3/location/suggest/by_query?query=Москва,{metro}.
 * Используется при автопостинге — ТЗ требует адрес = «м. {любое метро}».
 */
export async function fetchMoscowMetroJwt(
  session: BrowserSession,
  metroName: string,
  categoryId: number = 27
): Promise<{ jwt: string; text: string } | null> {
  if (!session.apiKey) return null;
  const query = encodeURIComponent(`Москва, ${metroName}`);
  const url = `https://m.avito.ru/api/3/location/suggest/by_query?flowType=publish&categoryId=${categoryId}&query=${query}&key=${encodeURIComponent(session.apiKey)}`;
  const opts: RequestInit & { dispatcher?: unknown } = {
    method: "GET",
    headers: {
      "User-Agent": session.userAgent,
      Cookie: buildCookieHeader(session.cookies),
      Accept: "application/json, text/plain, */*",
      Referer: "https://m.avito.ru/additem",
      "Sec-Ch-Ua": buildSecChUa(session.userAgent),
      "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
      "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
    } as Record<string, string>,
  };
  if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);
  try {
    const resp = await fetch(url, opts as RequestInit);
    if (!resp.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await resp.json();
    const blocks = data?.success?.blocks ?? [];
    for (const b of blocks) {
      for (const it of b.list ?? []) {
        if (it.kind === "metro" && typeof it.jwt === "string") {
          return { jwt: it.jwt, text: `${it.title}, ${it.subtitle}` };
        }
      }
    }
    return null;
  } catch (e) {
    console.error("[fetchMoscowMetroJwt] failed:", e);
    return null;
  }
}

/**
 * Получает дефолтный адрес продавца со свежим JWT (фолбэк, если метро не нашлось).
 */
async function fetchSellerDefaultAddress(
  session: BrowserSession,
  categoryId: number
): Promise<{ jwt: string; lat: number; lng: number; text: string; addressId: number } | null> {
  if (!session.apiKey) return null;
  const url = `https://m.avito.ru/api/3/location/suggest/by_query?flowType=publish&categoryId=${categoryId}&key=${encodeURIComponent(session.apiKey)}`;
  const opts: RequestInit & { dispatcher?: unknown } = {
    method: "GET",
    headers: {
      "User-Agent": session.userAgent,
      Cookie: buildCookieHeader(session.cookies),
      Accept: "application/json, text/plain, */*",
      Referer: "https://m.avito.ru/additem",
      "Sec-Ch-Ua": buildSecChUa(session.userAgent),
      "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
      "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
    } as Record<string, string>,
  };
  if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);
  try {
    const resp = await fetch(url, opts as RequestInit);
    if (!resp.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await resp.json();
    const blocks = data?.success?.blocks ?? [];
    // Ищем "buyerAddress" (дефолтный профильный) или первый с isDefault.
    for (const b of blocks) {
      for (const item of b.list ?? []) {
        if (item.isDefault || b.suggestType === "buyerAddress" || item.suggestType === "buyerAddress") {
          return {
            jwt: item.jwt,
            lat: item.coordinates?.latitude,
            lng: item.coordinates?.longitude,
            text: item.address || `${item.title}, ${item.subtitle}`,
            addressId: item.addressId,
          };
        }
      }
    }
    // Fallback: первый адрес из первого блока
    const first = blocks[0]?.list?.[0];
    if (first) {
      return {
        jwt: first.jwt,
        lat: first.coordinates?.latitude,
        lng: first.coordinates?.longitude,
        text: first.address || `${first.title}, ${first.subtitle}`,
        addressId: first.addressId,
      };
    }
    return null;
  } catch (e) {
    console.error("[fetchSellerDefaultAddress] failed:", e);
    return null;
  }
}

export interface SubmitListingInput {
  title: string;
  description: string;
  price: number;
  /** Адрес показа в объявлении ("Москва, Цветной бульвар, 1"). */
  address: string;
  /** Метро (для Москвы) — будет использовано для запроса свежего JWT. */
  metro?: string | null;
  /** Фото объявления (буферы; формат jpg/png). */
  photos: Buffer[];
  /** Контакт продавца (берётся из активной сессии, если не передан). */
  phone?: string;
  email?: string;
  sellerName?: string;
  /** Категория Avito для шаблона (по умолчанию "Обувь" — кроссовки). */
  category?: AvitoCategory;
  /** Бренд товара (имя). Резолвится в Avito option-id для params[115634]
   *  (категория 27). Не передан/не нашёлся → «Без бренда». */
  brand?: string | null;
}

export interface SubmitListingResult {
  ok: boolean;
  message?: string;
  avitoItemId?: string;
  avitoItemUrl?: string;
}

/**
 * Загружает один файл картинки на /web/1/images/upload.
 * Возвращает image ID (число-строка) или null.
 */
async function uploadAvitoImageBuf(
  session: BrowserSession,
  buf: Buffer
): Promise<string | null> {
  const url = `${AVITO_WEB_BASE}/web/1/images/upload`;
  const fd = new FormData();
  // Полевое имя у Avito = "image" (выявлено probe'ом — другие имена возвращают 500).
  // Buffer → копия ArrayBuffer: Blob типизирован под ArrayBuffer (не SharedArrayBuffer) в новом @types/node.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  fd.append("image", new Blob([ab], { type: "image/jpeg" }), "upload.jpg");
  const headers = { ...buildHeaders(session) } as Record<string, string>;
  delete headers["Content-Type"]; // boundary автоматически
  headers.Referer = "https://www.avito.ru/additem";
  headers.Accept = "application/json, text/plain, */*";
  const opts: RequestInit & { dispatcher?: unknown } = {
    method: "POST",
    headers,
    body: fd,
  };
  if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);
  try {
    const resp = await fetch(url, opts as RequestInit);
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`[submitListing] image upload ${resp.status}: ${text.slice(0, 300)}`);
      return null;
    }
    try {
      const j = JSON.parse(text);
      // Avito может вернуть { id }, { image: {id} }, { result: {id} }
      const id = j.id ?? j.image?.id ?? j.result?.id ?? j.data?.id;
      return id != null ? String(id) : null;
    } catch {
      console.error(`[submitListing] image upload non-JSON: ${text.slice(0, 200)}`);
      return null;
    }
  } catch (e) {
    console.error("[submitListing] image upload exception:", e);
    return null;
  }
}

/**
 * Поддерживаемые категории автопоста. Схемы (обязательные поля + option-id)
 * получены живым discovery через by_params → dicts/parameters (см. session-журнал).
 */
export type AvitoCategory =
  | "Головные уборы"
  | "Футболки"
  | "Свитеры"
  | "Худи"
  | "Свитшоты"
  | "Джинсы"
  | "Штаны"
  | "Шорты"
  | "Костюмы"
  | "Обувь"
  | "Часы";

export const AVITO_CATEGORIES: AvitoCategory[] = [
  "Головные уборы", "Футболки", "Свитеры", "Худи", "Свитшоты",
  "Джинсы", "Штаны", "Шорты", "Костюмы", "Обувь", "Часы",
];

interface CatCfg {
  /** category_id для submit/v2 (одежда/обувь=27, часы=28). */
  categoryId: string;
  /** id параметра адреса (2861 — одежда/обувь, 2862 — часы). */
  addressParam: string;
  /** [paramId, optionId] — «Вид объявления» (Продаю своё). */
  saleType: [string, string];
  /** [paramId, optionId] — «Состояние» (Новое с биркой / Новое для часов). */
  condition: [string, string];
  /** params[id]=value: навигация (вид/предмет/тип) + бренд + прочие обяз. селекты. */
  params: Record<string, string>;
  /** [paramId, optionIds[]] — размер, выбирается рандомно. Нет размера → undefined. */
  size?: [string, string[]];
}

const BRAND_NO = "17992455"; // «Без бренда» (params[115634])
const SIZE_SHOES = ["1211561", "1211563", "1211565"]; // 41, 42, 43 (params[115164])
const SIZE_CLOTHES = ["1364253", "1364254", "1364255"]; // S(46), M(48), L(50) (params[115539])

/**
 * Конфиг 11 категорий. Все option-id извлечены из реальных схем Avito
 * (by_params → dicts/parameters, 2026-06). Размеры рандомизируются: обувь 41-43,
 * одежда S/M/L. Состояние — «Новое с биркой» (часы — «Новое»). Бренд — «Без бренда».
 */
const AVITO_CATEGORY_CONFIG: Record<AvitoCategory, CatCfg> = {
  "Головные уборы": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "749", "111038": "521878", "116419": "1695334", "115634": BRAND_NO },
  },
  "Футболки": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "748", "176": "756", "154213": "3255283", "115634": BRAND_NO },
    size: ["115539", SIZE_CLOTHES],
  },
  "Свитеры": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "748", "176": "756", "154213": "3255289", "115634": BRAND_NO },
    size: ["115539", SIZE_CLOTHES],
  },
  "Худи": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "748", "176": "756", "154213": "3345903", "115634": BRAND_NO },
    size: ["115539", SIZE_CLOTHES],
  },
  "Свитшоты": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "748", "176": "756", "154213": "3255286", "115634": BRAND_NO },
    size: ["115539", SIZE_CLOTHES],
  },
  "Джинсы": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    // 185616 — обязательное «Я принимаю условия продажи в категории Личные вещи» = 1.
    params: { "175": "748", "176": "752", "115634": BRAND_NO, "185616": "1" },
    size: ["115539", SIZE_CLOTHES],
  },
  "Штаны": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "748", "176": "750", "115634": BRAND_NO },
    size: ["115539", SIZE_CLOTHES],
  },
  "Шорты": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "748", "176": "3258722", "115634": BRAND_NO },
    size: ["115539", SIZE_CLOTHES],
  },
  "Костюмы": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "748", "176": "754", "115634": BRAND_NO },
    size: ["115539", SIZE_CLOTHES],
  },
  "Обувь": {
    categoryId: "27", addressParam: "2861",
    saleType: ["2826", "20029"], condition: ["110385", "2804445"],
    params: { "175": "2804317", "118631": "2262814", "115634": BRAND_NO },
    size: ["115164", SIZE_SHOES],
  },
  "Часы": {
    categoryId: "28", addressParam: "2862",
    saleType: ["2829", "20038"], condition: ["110387", "431225"],
    params: { "104": "387", "144898": "3204542" },
  },
};

// =============================================================================
// Бренд → Avito option-id (params[115634], категория 27)
// =============================================================================

/**
 * Живой запрос к словарю брендов Avito (полный список ~7580 vs ~1000 в статике).
 * POST m.avito.ru/api/2/dicts/parameters/filter?key= с fieldId=115634 и query=<бренд>.
 * Возвращает option-id точного совпадения (или близкого), либо null. Требует apiKey.
 * НЕ бросает — на любой ошибке вернёт null (выше идёт статический фолбэк).
 */
async function brandFilterQueryApi(
  session: BrowserSession,
  cfg: CatCfg,
  publishSessionId: string,
  brand: string
): Promise<string | null> {
  if (!session.apiKey) return null;
  const body = new URLSearchParams();
  body.set("publishSessionId", publishSessionId);
  body.set("navigation[categoryId]", cfg.categoryId);
  body.set("navigation[categoryIds][0]", cfg.categoryId);
  body.set("navigation[config][tree]", "professional_mobile");
  body.set("navigation[config][layout]", "mav_add");
  // Нав-атрибуты (вид/предмет/тип) из конфига категории, кроме бренда.
  let ai = 0;
  for (const [pid, val] of Object.entries(cfg.params)) {
    if (pid === "115634") continue;
    body.set(`navigation[attributes][${ai}][id]`, pid);
    body.set(`navigation[attributes][${ai}][value]`, val);
    ai++;
  }
  body.set("fieldId", "115634");
  body.set("query", brand);
  body.set("limit", "20");
  body.set("offset", "0");

  const url = `https://m.avito.ru/api/2/dicts/parameters/filter?key=${encodeURIComponent(session.apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const opts: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers: {
        "User-Agent": session.userAgent,
        Cookie: buildCookieHeader(session.cookies),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ru-RU,ru;q=0.9",
        Origin: "https://m.avito.ru",
        Referer: "https://m.avito.ru/additem",
        "Sec-Ch-Ua": buildSecChUa(session.userAgent),
        "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
        "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
      } as Record<string, string>,
      body: body.toString(),
      signal: controller.signal,
    };
    if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);
    const resp = await fetch(url, opts as RequestInit);
    if (!resp.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await resp.json().catch(() => null);
    const sections = data?.result?.sections ?? [];
    const norm = brand.trim().toLowerCase();
    let close: string | null = null;
    for (const s of sections) {
      for (const v of s?.values ?? []) {
        const id = String(v?.id ?? "");
        const title = String(v?.title ?? "").trim().toLowerCase();
        // Пропускаем «Без бренда» (17992455) и «Другой» (17992456).
        if (!id || id === "17992455" || id === "17992456" || !title) continue;
        if (title === norm) return id; // точное совпадение
        if (!close && (title.startsWith(norm) || norm.startsWith(title))) close = id;
      }
    }
    return close;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Резолвит бренд товара в Avito option-id для params[115634].
 * Порядок: живой словарь (полное покрытие, нужен apiKey) → статическая карта
 * (популярные бренды, оффлайн) → «Без бренда». Бренд-параметр есть только у
 * категории 27 (одежда/обувь); для часов и др. — всегда «Без бренда».
 */
async function resolveBrandOptionId(
  session: BrowserSession,
  cfg: CatCfg,
  publishSessionId: string,
  brand?: string | null
): Promise<string> {
  if (cfg.categoryId !== "27") return AVITO_BRAND_NO;
  if (!brand || !brand.trim()) return AVITO_BRAND_NO;
  // Статическая карта (полный список ~7573 бренда из словаря Avito) — мгновенно,
  // без сети, не зависит от антибота в воркере. Покрывает практически всё.
  const stat = resolveAvitoBrandId(brand);
  if (stat !== AVITO_BRAND_NO) return stat;
  // Промах статики (бренд добавлен в Avito позже снимка) → живой словарь.
  const live = await brandFilterQueryApi(session, cfg, publishSessionId, brand).catch(() => null);
  return live ?? AVITO_BRAND_NO;
}

/**
 * Создаёт объявление через cookies-flow на /item-add/submit/v2.
 * Категория берётся из input.category (по умолчанию «Обувь»); шаблон —
 * из AVITO_CATEGORY_CONFIG. Возвращает { ok, avitoItemId?, avitoItemUrl?, message? }.
 */
export async function submitAvitoListingViaCookies(
  session: BrowserSession,
  input: SubmitListingInput
): Promise<SubmitListingResult> {
  if (!session.cookies?.length) {
    return { ok: false, message: "Нет cookies сессии" };
  }
  if (!input.photos?.length) {
    return { ok: false, message: "Нет фото" };
  }

  // 1) Загружаем все фото → массив image IDs
  const imageIds: string[] = [];
  for (const buf of input.photos) {
    const id = await uploadAvitoImageBuf(session, buf);
    if (id) imageIds.push(id);
  }
  if (imageIds.length === 0) {
    return { ok: false, message: "Avito отверг все фото при загрузке" };
  }

  // publishSessionId — формат www.avito.ru: {userId}_{counter}_{unixSec}_{rand}
  const r1 = Math.floor(Math.random() * 900_000_000) + 100_000_000;
  const r3 = Math.floor(Math.random() * 900_000) + 100_000;
  const publishSessionId = `${r1}_${Math.floor(Math.random() * 99) + 1}_${Math.floor(Date.now() / 1000)}_${r3}`;

  // 3) Готовим multipart форму. Захардкожена категория 27 (Кроссовки)
  // на основе HAR `obyava.har` — Лёнин workspace, Москва, м. Юго-Западная.
  // Динамически подставляются только: title, description, price, images[].
  // Адрес/JWT/координаты — статичны (Вернадский 86с1, metro_id=145).
  // Для других категорий нужен отдельный template.
  const fd = new FormData();
  fd.append("title", input.title);
  fd.append("description", input.description);
  fd.append("price", String(input.price));
  for (const id of imageIds) fd.append("images[]", id);

  // ━━━━━━━━ КОНФИГ-ДВИЖОК КАТЕГОРИЙ ━━━━━━━━
  // Адрес — рандомное метро Коричневой кольцевой (ТЗ).
  const m = pickBrownRingMetro();
  const category: AvitoCategory = input.category ?? "Обувь";
  const cfg = AVITO_CATEGORY_CONFIG[category];
  console.log(`[submitListing] category=${category} cat_id=${cfg.categoryId} metro=${m.name} (id=${m.metroId})`);

  // Базовые структурные поля — общие для всех категорий.
  const form: Record<string, string> = {
    stockMultiple: "0",
    "cncProperties[minPreparationDays]": "1",
    "cncProperties[maxPreparationDays]": "5",
    "cncProperties[enableForAllItems]": "false",
    // Контакты — из акка (хендлер передаёт sellerName/phone от профиля+avito_login).
    // Хардкод Лёни убран: на чужой акк его телефон уходить не должен. Фолбэк —
    // глобальный env (если задан владельцем) либо пусто (Avito возьмёт дефолт акка).
    email: input.email ?? process.env.AVITO_AUTOPOST_EMAIL ?? "",
    seller_name: input.sellerName ?? process.env.AVITO_AUTOPOST_SELLER_NAME ?? "",
    phone: input.phone ?? process.env.AVITO_AUTOPOST_PHONE ?? "",
    allow_mails: "",
    hidePhone: "",
    "iacDevices[]": "2CE28A1D-3647-4484-AFAA-71F3A4E4C0B5",
    autoPublish: "1",
    deliveryCourier: "1",
    deliveryPvz: "1",
    deliveryCnc: "1",
    returnPolicy: "",
    category_id: cfg.categoryId,
    address: m.address,
    locationId: String(m.locationId),
    metro_id: String(m.metroId),
    district_id: String(m.districtId),
    "coords[lat]": String(m.lat),
    "coords[lng]": String(m.lng),
    "coords[zoom]": "16",
    geoFieldsHash: m.geoFieldsHash,
    skipConfirm: "1",
    publishSessionId,
  };

  // Адрес как параметр категории (2861 одежда/обувь, 2862 часы).
  form[`params[${cfg.addressParam}]`] = m.address;
  // Состояние + вид объявления.
  form[`params[${cfg.condition[0]}]`] = cfg.condition[1];
  form[`params[${cfg.saleType[0]}]`] = cfg.saleType[1];
  // Навигация (вид/предмет/тип) + бренд + прочие обязательные селекты.
  for (const [pid, val] of Object.entries(cfg.params)) {
    form[`params[${pid}]`] = val;
  }
  // Бренд: резолвим имя бренда товара в Avito option-id (живой словарь → статика
  // → «Без бренда»). Переопределяет дефолтный BRAND_NO из cfg.params.
  if (cfg.categoryId === "27") {
    const brandId = await resolveBrandOptionId(session, cfg, publishSessionId, input.brand);
    form["params[115634]"] = brandId;
    if (brandId !== AVITO_BRAND_NO) {
      console.log(`[submitListing] brand "${input.brand}" → option ${brandId}`);
    }
  }
  // Размер — рандом из диапазона категории (обувь 41-43, одежда S/M/L).
  if (cfg.size) {
    const [sizeParam, opts] = cfg.size;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    form[`params[${sizeParam}]`] = pick;
    console.log(`[submitListing] size option=${pick} (param ${sizeParam})`);
  }

  for (const [k, v] of Object.entries(form)) {
    fd.append(k, v);
  }

  // 4) POST на /item-add/submit/v2
  const submitUrl = `${AVITO_WEB_BASE}/item-add/submit/v2`;
  const sh = { ...buildHeaders(session) } as Record<string, string>;
  delete sh["Content-Type"];
  sh.Referer = "https://www.avito.ru/additem";
  sh.Accept = "application/json, text/plain, */*";
  const sopts: RequestInit & { dispatcher?: unknown } = {
    method: "POST",
    headers: sh,
    body: fd,
  };
  if (session.proxyUrl) sopts.dispatcher = new ProxyAgent(session.proxyUrl);
  try {
    const resp = await fetch(submitUrl, sopts as RequestInit);
    const text = await resp.text();
    console.log(`[submitListing] submit/v2 status=${resp.status} body=${text.slice(0, 800)}`);
    if (!resp.ok) {
      return { ok: false, message: `Avito ${resp.status}: ${text.slice(0, 300)}` };
    }
    try {
      const j = JSON.parse(text);
      // Реальный success: status:"ok" / success:true И есть itemId/url.
      const looksOk =
        j.status === "ok" ||
        j.success === true ||
        typeof j.itemId === "string" ||
        typeof j.url === "string";
      if (!looksOk) {
        // Validation / soft-error: статуса нет → возвращаем body как message.
        const errMsg =
          j.result?.message ??
          j.message ??
          j.error?.message ??
          JSON.stringify(j).slice(0, 300);
        return { ok: false, message: `Avito не принял: ${errMsg}` };
      }
      const url = j.url ?? j.itemUrl ?? j.result?.url ?? j.item?.url;
      const itemUrl =
        typeof url === "string"
          ? url.startsWith("http")
            ? url
            : `${AVITO_WEB_BASE}${url}`
          : undefined;
      const itemId =
        j.itemId ??
        j.item?.id ??
        j.result?.itemId ??
        itemUrl?.match(/_(\d{6,})$/)?.[1];
      return {
        ok: true,
        avitoItemUrl: itemUrl,
        avitoItemId: itemId != null ? String(itemId) : undefined,
        message: j.result?.message ?? "Опубликовано",
      };
    } catch {
      return { ok: false, message: `Avito non-JSON: ${text.slice(0, 300)}` };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// =============================================================================
// Send Message (отправка через web API)
// =============================================================================

export interface WebAvitoSendResult {
  messageId: string | null;
  success: boolean;
}

/**
 * Отправить текстовое сообщение в чат (cookies-flow).
 * Эндпоинт (проверен live 2026-06-08): POST /web/1/messenger/sendTextMessage
 *   body { channelId, text, idempotencyKey } — text на ВЕРХНЕМ уровне (НЕ
 *   message.text), idempotencyKey обязателен. Старый /chats/{id}/messages = 404.
 * Ответ: { success: {...} }; ошибка лежит в success.error (HTTP всё равно 200).
 */
export async function sendAvitoWebMessage(
  session: BrowserSession,
  chatId: string,
  text: string
): Promise<WebAvitoSendResult> {
  const response = await avitoWebFetch("/web/1/messenger/sendTextMessage", session, {
    method: "POST",
    body: { channelId: chatId, text, idempotencyKey: randomUUID() },
    referer: `https://www.avito.ru/profile/messenger/channel/${chatId}`,
  });

  if (!response.ok) {
    return { messageId: null, success: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json().catch(() => null);
  if (data?.success?.error) {
    console.error("[sendAvitoWebMessage] Avito error:", JSON.stringify(data.success.error));
    return { messageId: null, success: false };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ok: any = data?.success ?? data ?? {};
  return {
    messageId: String(ok.id ?? ok.messageId ?? data?.id ?? "") || null,
    success: true,
  };
}

// =============================================================================
// Profile Overview (профиль пользователя)
// =============================================================================

export interface WebAvitoProfile {
  userId: number | null;
  name: string | null;
  rating: number | null;
  reviewsCount: number | null;
}

/**
 * Профиль продавца через мобильный BeduinUI: GET m.avito.ru/api/4/profile?key={apiKey}.
 * (Старый /web/1/user/info отдаёт 404.) Публичный, без OAuth-подписки.
 * Содержит name + reputationPreferences (Avito-репутация продавца = «Уровень
 * сервиса», score 0-100, не классические 0-5 звёзд — те есть только при отзывах).
 */
export async function fetchAvitoProfile(session: BrowserSession): Promise<WebAvitoProfile> {
  if (!session.apiKey) {
    throw new Error("Avito profile: нет apiKey BeduinUI (нужен sync)");
  }
  const url = `https://m.avito.ru/api/4/profile?key=${encodeURIComponent(session.apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = {
      "User-Agent": session.userAgent,
      Cookie: buildCookieHeader(session.cookies),
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9",
      Referer: "https://m.avito.ru/profile",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Ch-Ua": buildSecChUa(session.userAgent),
      "Sec-Ch-Ua-Mobile": detectPlatform(session.userAgent).mobile,
      "Sec-Ch-Ua-Platform": detectPlatform(session.userAgent).platform,
    } as Record<string, string>;
    const opts: RequestInit & { dispatcher?: unknown } = {
      method: "GET",
      headers,
      signal: controller.signal,
    };
    if (session.proxyUrl) opts.dispatcher = new ProxyAgent(session.proxyUrl);
    const resp = await fetch(url, opts as RequestInit);
    if (resp.status === 401 || resp.status === 403) throw new SessionExpiredError();
    if (!resp.ok) throw new Error(`Avito profile error: ${resp.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await resp.json();
    // Звёздный рейтинг (0-5 из отзывов) Avito в /api/4/profile НЕ отдаёт —
    // только reputationPreferences («Уровень сервиса», 0-100, не звёзды). Если у
    // продавца есть классический звёздный рейтинг — он в data.rating.score (0-5).
    // Берём ТОЛЬКО настоящие звёзды; иначе rating=null → UI «Рейтинг не доступен».
    const star = data.rating?.score;
    const validStar = typeof star === "number" && star > 0 && star <= 5;
    return {
      userId: data.id ?? data.userId ?? null,
      name: data.name ?? data.displayName ?? null,
      rating: validStar ? star : null,
      reviewsCount: data.rating?.reviewsCount ?? data.reviewsCount ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

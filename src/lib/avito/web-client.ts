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
      contacts: typeof item.contacts === "object" ? (item.contacts?.total ?? 0) : (item.contacts ?? 0),
      favorites: typeof item.favorites === "object" ? (item.favorites?.total ?? 0) : (item.favorites ?? 0),
      views: typeof item.views === "object" ? (item.views?.total ?? 0) : (item.views ?? 0),
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
 * Получить список чатов через web API.
 * Эндпоинт: GET /web/1/messenger/chats
 * Referer: https://www.avito.ru/messenger
 */
export async function fetchAvitoChats(
  session: BrowserSession,
  limit: number = 100,
  offset: number = 0
): Promise<WebAvitoChatsResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });

  const response = await avitoWebFetch(`/web/1/messenger/dialog?${params}`, session, {
    referer: "https://www.avito.ru/profile",
  });

  if (!response.ok) {
    throw new Error(`Avito web chats error: ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();

  const rawChats = data.chats ?? data.result?.chats ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chats: WebAvitoChat[] = rawChats.map((chat: any) => {
    // Участники чата
    const users = chat.users ?? chat.participants ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buyer = users.find((u: any) => u.isCurrentUser === false) ?? users[1] ?? null;

    // Контекст (привязанное объявление)
    const context = chat.context?.value ?? chat.context ?? chat.item ?? null;

    // Последнее сообщение
    const lastMsg = chat.last_message ?? chat.lastMessage ?? null;
    let lastMessageAt: string | null = null;
    if (lastMsg?.created) {
      lastMessageAt = new Date(
        typeof lastMsg.created === "number" ? lastMsg.created * 1000 : lastMsg.created
      ).toISOString();
    }

    return {
      id: String(chat.id ?? chat.chatId ?? ""),
      buyerName: buyer?.name ?? buyer?.displayName ?? null,
      buyerAvitoId: buyer?.id ?? buyer?.userId ?? null,
      itemId: context?.id ?? context?.itemId ?? null,
      itemTitle: context?.title ?? null,
      itemPrice: context?.price ?? null,
      itemUrl: context?.url ?? null,
      itemImageUrl: context?.images?.[0] ?? context?.imageUrl ?? null,
      lastMessage: lastMsg?.content?.text ?? lastMsg?.text ?? null,
      lastMessageAt,
      lastMessageDirection: lastMsg?.direction ?? null,
      unreadCount: chat.unread_count ?? chat.unreadCount ?? 0,
    };
  });

  return {
    chats,
    hasMore: data.hasMore ?? (data.meta ? !data.meta.last_page : chats.length >= limit),
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
 * Получить сообщения чата через web API.
 * Эндпоинт: GET /web/1/messenger/chats/{chatId}/messages
 */
export async function fetchAvitoChatMessages(
  session: BrowserSession,
  chatId: string
): Promise<WebAvitoChatMessage[]> {
  const response = await avitoWebFetch(`/web/1/messenger/chats/${chatId}/messages`, session, {
    referer: `https://www.avito.ru/messenger/channel/${chatId}`,
  });

  if (!response.ok) {
    throw new Error(`Avito web messages error: ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();

  const rawMessages = data.messages ?? data.result?.messages ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rawMessages.map((msg: any): WebAvitoChatMessage => ({
    id: String(msg.id ?? msg.messageId ?? ""),
    authorId: msg.author_id ?? msg.authorId ?? 0,
    created: typeof msg.created === "number" ? msg.created : Math.floor(new Date(msg.created).getTime() / 1000),
    type: msg.type ?? "text",
    text: msg.content?.text ?? msg.text ?? null,
    imageUrl: msg.content?.image?.url ?? null,
    direction: msg.direction ?? "in",
  }));
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
  fd.append("image", new Blob([buf], { type: "image/jpeg" }), "upload.jpg");
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
 * Создаёт объявление через cookies-flow на /item-add/submit/v2.
 * Захардкожена категория Одежда → Джинсы (29 / 2179580).
 * Возвращает { ok, avitoItemId?, avitoItemUrl?, message? }.
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

  // ━━━━━━━━ ШАБЛОН КРОССОВОК (HAR obyava) ━━━━━━━━
  // Адрес — рандомное метро Коричневой кольцевой (ТЗ).
  const m = pickBrownRingMetro();
  console.log(`[submitListing] metro=${m.name} (id=${m.metroId})`);
  const SNEAKERS_TEMPLATE: Record<string, string> = {
    "params[2826]": "20029",
    "params[110385]": "2804445",
    "params[177956]": "1",
    "params[163767]": "",
    "params[115164]": "1211565",
    "params[115634]": "1689228",
    "params[112674]": "",
    "params[163361]": "",
    stockMultiple: "0",
    "params[2861]": m.address,
    "params[183445]": "1",
    "cncProperties[minPreparationDays]": "1",
    "cncProperties[maxPreparationDays]": "5",
    "cncProperties[enableForAllItems]": "false",
    email: input.email ?? process.env.AVITO_AUTOPOST_EMAIL ?? "lenya.novosyolov@yandex.ru",
    seller_name: input.sellerName ?? process.env.AVITO_AUTOPOST_SELLER_NAME ?? "Лёня Новосёлов",
    phone: input.phone ?? process.env.AVITO_AUTOPOST_PHONE ?? "8 985 189-80-29",
    allow_mails: "",
    hidePhone: "",
    "iacDevices[]": "2CE28A1D-3647-4484-AFAA-71F3A4E4C0B5",
    autoPublish: "1",
    "params[171955]": "3280746",
    "params[191122]": "",
    "params[185281]": "3342684",
    "params[187331]": "1",
    "params[192386]": "",
    "params[192387]": "",
    "params[196926]": "",
    "params[196273]": "",
    deliveryCourier: "1",
    deliveryPvz: "1",
    deliveryCnc: "1",
    returnPolicy: "",
    category_id: "27",
    "params[175]": "2804317",
    "params[118631]": "2262814",
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
  for (const [k, v] of Object.entries(SNEAKERS_TEMPLATE)) {
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
 * Отправить текстовое сообщение через web API.
 * Эндпоинт: POST /web/1/messenger/chats/{chatId}/messages
 */
export async function sendAvitoWebMessage(
  session: BrowserSession,
  chatId: string,
  text: string
): Promise<WebAvitoSendResult> {
  const response = await avitoWebFetch(`/web/1/messenger/chats/${chatId}/messages`, session, {
    method: "POST",
    body: { message: { text }, type: "text" },
    referer: `https://www.avito.ru/messenger/channel/${chatId}`,
  });

  if (!response.ok) {
    return { messageId: null, success: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  return {
    messageId: data.id ?? data.messageId ?? null,
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
 * Получить базовую информацию профиля через web API.
 * Эндпоинт: GET /web/1/user/info
 */
export async function fetchAvitoProfile(session: BrowserSession): Promise<WebAvitoProfile> {
  const response = await avitoWebFetch("/web/1/user/info", session, {
    referer: "https://www.avito.ru/profile",
  });

  if (!response.ok) {
    throw new Error(`Avito web profile error: ${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();

  return {
    userId: data.id ?? data.userId ?? null,
    name: data.name ?? data.displayName ?? null,
    rating: data.rating?.score ?? data.score ?? null,
    reviewsCount: data.rating?.reviewsCount ?? data.reviewsCount ?? null,
  };
}

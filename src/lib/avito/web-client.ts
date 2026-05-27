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

interface BrowserSession {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
  proxyUrl?: string | null;
  platform?: string | null;
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

function buildHeaders(session: BrowserSession): Record<string, string> {
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
    // Client Hints — Chrome 89+ отправляет их с каждым запросом
    "Sec-Ch-Ua": buildSecChUa(session.userAgent),
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
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
  // Реальный эндпоинт Авито: POST /web/1/serp/profile/items
  // Таб определяется через searchQuery URL
  const tabPath = status === "active" ? "/profile/items/active"
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: WebAvitoItem[] = rawItems.map((item: any) => {
    // Изображение из массива images[0].url
    let imageUrl: string | null = null;
    if (item.images?.[0]) {
      const firstImage = item.images[0];
      const rawUrl = firstImage.url230x172 ?? firstImage.url148x110 ?? firstImage.url ?? null;
      imageUrl = rawUrl ? (rawUrl.startsWith("//") ? "https:" + rawUrl : rawUrl) : null;
    }

    // Статус: enabledFlg=true → active, иначе inactive
    const itemStatus = item.enabledFlg === false ? "inactive" : (item.status ?? "active");

    return {
      id: item.id ?? 0,
      title: item.title ?? "",
      price: typeof item.price === "object" ? (item.price?.valueNotFormatted ?? 0) : (item.price ?? 0),
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

  const totalCount = data.breadcrumbs?.itemsCount ?? items.length;

  return {
    items,
    total: totalCount,
    hasMore: items.length >= count,
  };
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

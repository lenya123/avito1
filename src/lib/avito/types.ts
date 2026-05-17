/**
 * Типы Avito API
 *
 * Верифицировано по официальным OpenAPI спецификациям:
 * https://developers.avito.ru/api-catalog
 *
 * Критические особенности:
 * - chat_id и message_id — СТРОКИ (не числа)
 * - user_id (Avito) — INTEGER (int64)
 * - Чаты: GET /messenger/v2/...
 * - Сообщения: GET /messenger/v3/.../messages/ (trailing slash!)
 * - Отправка: POST /messenger/v1/... body: { message: { text }, type: "text" }
 * - v3 messages возвращает голый массив, не объект
 * - Баланс: { real, bonus } (не { balance })
 */

// --- Generic Result ---

export type AvitoResult<T> = { success: true; data: T } | { success: false; error: string };

// --- Auth ---

export interface AvitoTokenResponse {
  access_token: string;
  expires_in: number; // 86400 (24h)
  token_type: "Bearer";
}

// --- User ---

export interface AvitoSelf {
  id: number;
  name: string;
  email: string;
  phone: string; // строка, не число
  phones?: string[];
  profile_url: string;
}

export interface AvitoBalance {
  real: number; // рубли
  bonus: number; // бонусы
}

// --- Items (Объявления) ---

export interface AvitoItemCategory {
  id: number;
  name: string;
}

export interface AvitoApiItem {
  id: number;
  title: string;
  price: number;
  url: string;
  status: string; // active | removed | old | blocked | rejected
  category: AvitoItemCategory;
  address: string;
  images?: Array<Record<string, string>>; // [{"640x480": "https://..."}, ...]
}

export interface AvitoItemsResponse {
  resources: AvitoApiItem[];
  meta: {
    page: number;
    per_page: number;
  };
}

export interface AvitoItemInfo {
  id: number;
  status: string; // active | removed | old | blocked | not_found | another_user
  url: string;
  start_time?: string;
  finish_time?: string;
  autoload_item_id?: string;
}

// --- Messenger (v2 chats, v3 messages, v1 send) ---

export interface AvitoChatUser {
  id: number;
  name: string;
  profile_url?: string;
}

export interface AvitoChatContext {
  value: {
    id: number;
    title: string;
    price: number;
    url: string;
    images?: string[];
  };
}

export interface AvitoChatLastMessage {
  id: string;
  content?: AvitoMessageContent;
  text?: string; // fallback, API обычно возвращает content.text
  type?: string;
  author_id?: number;
  created: number; // unix timestamp
  direction: "in" | "out";
}

export interface AvitoApiChat {
  id: string; // STRING, не число!
  users: AvitoChatUser[];
  context?: AvitoChatContext;
  last_message?: AvitoChatLastMessage;
  created: number;
  updated: number;
  unread_count: number;
}

export interface AvitoChatsResponse {
  chats: AvitoApiChat[];
  meta: {
    last_page: boolean;
  };
}

export interface AvitoMessageContent {
  text?: string;
  image?: {
    url: string;
    id?: string;
  };
  link?: {
    url: string;
    text?: string;
  };
}

export interface AvitoApiMessage {
  id: string; // STRING, не число!
  author_id: number;
  created: number; // unix timestamp
  type: string; // text | image | system | item | call | link | location | deleted
  content: AvitoMessageContent;
  direction: "in" | "out";
  is_read?: boolean;
}

// v3 messages endpoint возвращает { messages: AvitoApiMessage[] }
export interface AvitoMessagesResponse {
  messages: AvitoApiMessage[];
}

// --- Send Message ---

export interface AvitoSendMessageBody {
  message: {
    text: string;
  };
  type: "text";
}

export interface AvitoSendMessageResponse {
  id: string;
  created: number;
}

// --- Webhook ---

export interface AvitoWebhookPayload {
  id: string;
  version: string; // "v1.1"
  timestamp: number;
  payload: {
    type: "message";
    value: {
      id: string; // message ID
      chat_id: string; // STRING!
      author_id: number; // кто отправил
      user_id: number; // наш аккаунт (владелец webhook)
      created: number; // unix timestamp
      published_at?: string; // RFC3339
      type: string; // text | image | system | item | call | link | location | deleted | appCall | file | video | voice
      content: AvitoMessageContent;
      chat_type: "u2i" | "u2u";
      item_id?: number;
      read?: number;
    };
  };
}

// --- Send Image Message ---

export interface AvitoUploadImageResponse {
  id: string; // image_id для отправки
}

export interface AvitoSendImageMessageResponse {
  author_id: number;
  content: { image: { url: string; id: string } };
  created: number;
  direction: "out";
  id: string;
  type: "image";
}

// --- Delete Message ---
// Сообщение не удаляется, а меняет тип на "deleted". Удалять можно не позднее 1ч после отправки.

// --- Chat Info (v2 single chat) ---

export interface AvitoChatInfoResponse {
  id: string;
  users: AvitoChatUser[];
  context?: AvitoChatContext;
  last_message?: AvitoChatLastMessage;
  created: number;
  updated: number;
  unread_count: number;
}

// --- Webhook Subscriptions ---

export interface AvitoWebhookSubscription {
  url: string;
  version: string;
}

export interface AvitoSubscriptionsResponse {
  subscriptions: AvitoWebhookSubscription[];
}

// --- Voice Messages ---

export interface AvitoVoiceFile {
  id: string;
  url: string;
}

export interface AvitoVoiceFilesResponse {
  files: AvitoVoiceFile[];
}

// --- Ratings & Reviews ---

export interface AvitoReviewAnswer {
  id: number;
  text: string;
  created: number; // Unix timestamp (seconds)
}

export interface AvitoReview {
  id: number;
  created: number; // Unix timestamp (seconds)
  text: string;
  sender: { id: number; name: string };
  score: number; // 1-5
  order_id?: number;
  item?: { id: number; title: string };
  answer?: AvitoReviewAnswer;
}

export interface AvitoReviewsResponse {
  reviews: AvitoReview[];
  total: number;
  limit: number;
  offset: number;
}

/** Сырой ответ GET /ratings/v1/info */
export interface AvitoRatingInfoRaw {
  isEnabled: boolean;
  rating: {
    reviewsCount: number;
    reviewsWithScoreCount: number;
    score: number;
  };
}

/** Нормализованный рейтинг (используется в UI) */
export interface AvitoRatingInfo {
  score: number;
  total_reviews: number;
}

// --- Promotion ---

export interface AvitoVasPrice {
  vas_id: string;
  price: number;
  period?: number;
}

export interface AvitoVasPricesResponse {
  status: string;
  vas: AvitoVasPrice[];
}

export interface AvitoApplyVasResponse {
  status: string;
}

// --- Params ---

export interface AvitoGetItemsParams {
  page?: number;
  per_page?: number; // max 100, default 25
  status?: "active" | "removed" | "old" | "blocked" | "rejected";
  updatedAtFrom?: string; // YYYY-MM-DD
  category?: number;
}

export interface AvitoGetChatsParams {
  item_ids?: number[];
  unread_only?: boolean;
  chat_types?: string; // "u2i" | "u2u" | "u2i,u2u" (default: "u2i")
  limit?: number; // max 100
  offset?: number; // max 1000
}

// --- Update Price ---

export interface AvitoUpdatePriceResponse {
  result: {
    status: string;
    messages: Record<string, string>;
  };
}

// --- Stats V2 (расширенная аналитика) ---
// Docs: https://developers.avito.ru/api-catalog/item/documentation#operation/getAccountItemsStats
// Endpoint: POST /stats/v2/accounts/{user_id}/items
// Формат полностью отличается от v1: camelCase ключи, metrics вместо fields, grouping вместо period_grouping

export interface AvitoItemStatsV2Request {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  metrics: string[]; // ["views", "contacts", "favorites", "impressions", ...]
  grouping: "day" | "week" | "month" | "item" | "totals";
  limit: number; // 0..1000
  offset: number; // >= 0
  filter?: {
    categoryIDs?: number[];
    employeeIDs?: number[];
  };
  sort?: {
    field?: string;
    order?: "asc" | "desc";
  };
}

export interface AvitoItemStatsV2Metric {
  slug: string; // "views" | "contacts" | "favorites" | "impressions" | ...
  value: number;
}

export interface AvitoItemStatsV2Grouping {
  id: number; // avito_item_id
  type: string; // "items"
  metrics: AvitoItemStatsV2Metric[];
}

export interface AvitoItemStatsV2Response {
  result: {
    dataTotalCount: number;
    groupings: AvitoItemStatsV2Grouping[];
  };
}

// --- Operations History (финансовая история) ---

export interface AvitoOperationsHistoryRequest {
  datetime_from: string; // RFC3339
  datetime_to: string;
}

export interface AvitoOperation {
  id: number;
  operation_name: string;
  datetime: string;
  amount_total: number;
  amount_bonus: number;
  amount_rub: number;
  service_name?: string;
  item_id?: number;
}

export interface AvitoOperationsHistoryResponse {
  result: {
    operations: AvitoOperation[];
    total: number;
  };
}

// --- Autoload (Автозагрузка) ---

export interface AvitoAutoloadProfile {
  fee_for_repost: boolean;
  publish_immediately: boolean;
  schedule: Array<{
    day: string;
    time: string;
  }>;
  url: string;
}

export interface AvitoAutoloadReport {
  id: number;
  created_at: string;
  finished_at?: string;
  status: string; // "completed" | "processing" | "failed"
  ads_total: number;
  ads_created: number;
  ads_updated: number;
  ads_errors: number;
}

export interface AvitoAutoloadReportsResponse {
  reports: AvitoAutoloadReport[];
}

export interface AvitoAutoloadReportItem {
  ad_id: string;
  avito_id?: number;
  title: string;
  status: string;
  errors?: string[];
  url?: string;
}

export interface AvitoAutoloadReportItemsResponse {
  items: AvitoAutoloadReportItem[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface AvitoAutoloadIdMappingResponse {
  items: Array<{
    ad_id: string;
    avito_id: number;
  }>;
}

// --- Stock Management (Управление остатками) ---

export interface AvitoStockItem {
  sku: string;
  count: number;
}

export interface AvitoStocksResponse {
  stocks: AvitoStockItem[];
}

export interface AvitoUpdateStocksRequest {
  stocks: AvitoStockItem[];
}

// --- Browser Session & Orders (web API) ---

export interface AvitoSessionStatus {
  status: "pending" | "awaiting_sms" | "active" | "expired" | "error" | null;
  lastLoginAt: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
  hasLogin: boolean;
  proxyHost: string | null;
  avitoLogin: string | null;
}

export interface AvitoWebOrder {
  orderId: string;
  status: {
    value: string;
    label: string;
    color: string;
    requiredAction?: boolean;
  };
  cost: { total: number };
  createdAt: string;
  updatedAt: string;
  imgSet: Array<{ src: string; alt: string; width: number; height: number }>;
  provider: {
    value: string;
    label: string;
    trackingNumber?: string;
    copiedTrackingNumber?: string;
  };
  channelId: string;
  serviceKey: string;
  userKind: "seller" | "buyer";
  totalItemsCount: number;
  info?: string;
}

export interface AvitoWebOrdersResponse {
  orders: AvitoWebOrder[];
  hasMore: boolean;
  hasArchive: boolean;
}

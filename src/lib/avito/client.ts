/**
 * Avito API Client
 *
 * По паттерну src/lib/delivery/client.ts.
 * Авторизация: OAuth 2.0 client_credentials (токены 24ч).
 * Кеш токенов: module-level Map (persist в процессе).
 *
 * Rate limits:
 * - GET /core/v1/items: 25/min
 * - GET /core/v1/accounts/{uid}/items/{itemId}/: 500/min
 * - POST /core/v1/items/{itemId}/update_price: 150/min
 */

import type {
  AvitoResult,
  AvitoTokenResponse,
  AvitoSelf,
  AvitoBalance,
  AvitoItemsResponse,
  AvitoItemInfo,
  AvitoItemStatsV2Response,
  AvitoItemStatsV2Request,
  AvitoUpdatePriceResponse,
  AvitoChatsResponse,
  AvitoChatInfoResponse,
  AvitoMessagesResponse,
  AvitoSendMessageResponse,
  AvitoSendImageMessageResponse,
  AvitoUploadImageResponse,
  AvitoSubscriptionsResponse,
  AvitoVoiceFilesResponse,
  AvitoGetItemsParams,
  AvitoGetChatsParams,
  AvitoReviewsResponse,
  AvitoRatingInfo,
  AvitoRatingInfoRaw,
  AvitoVasPricesResponse,
  AvitoApplyVasResponse,
  AvitoOperationsHistoryResponse,
  AvitoAutoloadProfile,
  AvitoAutoloadReportsResponse,
  AvitoAutoloadReportItemsResponse,
  AvitoAutoloadIdMappingResponse,
  AvitoStocksResponse,
  AvitoStockItem,
} from "./types";

const AVITO_API = "https://api.avito.ru";

// Module-level token cache (persist в процессе, как singleton Queue в queues.ts)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export class AvitoClient {
  private clientId: string;
  private clientSecret: string;
  private avitoUserId: number;

  constructor(clientId: string, clientSecret: string, avitoUserId: number) {
    if (!clientId) throw new Error("Avito client_id is required");
    if (!clientSecret) throw new Error("Avito client_secret is required");
    if (!avitoUserId) throw new Error("Avito user_id is required");

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.avitoUserId = avitoUserId;
  }

  // --- Token Management ---

  private async getToken(): Promise<string> {
    const cacheKey = this.clientId;
    const cached = tokenCache.get(cacheKey);

    // Используем кеш если токен ещё валиден (с запасом 5 минут)
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      return cached.token;
    }

    // Запрашиваем новый токен
    const response = await fetch(`${AVITO_API}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      tokenCache.delete(cacheKey);
      throw new Error(`Avito auth failed: ${response.status} ${errorText}`);
    }

    const data: AvitoTokenResponse = await response.json();

    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    return data.access_token;
  }

  private invalidateToken(): void {
    tokenCache.delete(this.clientId);
  }

  // --- Request Wrappers ---

  /** Multipart/form-data запрос (для загрузки изображений) */
  private async requestFormData<T>(path: string, formData: FormData): Promise<AvitoResult<T>> {
    try {
      const token = await this.getToken();

      let response = await fetch(`${AVITO_API}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.status === 403) {
        this.invalidateToken();
        const newToken = await this.getToken();
        response = await fetch(`${AVITO_API}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${newToken}` },
          body: formData,
        });
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText || response.statusText}`,
        };
      }

      const data = await response.json();
      return { success: true, data: data as T };
    } catch (error) {
      console.error(`[AvitoClient] POST ${path} (form-data) error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Ошибка запроса к Avito API",
      };
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<AvitoResult<T>> {
    try {
      const token = await this.getToken();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (body) {
        headers["Content-Type"] = "application/json";
      }

      const signal = AbortSignal.timeout(15_000);

      let response = await fetch(`${AVITO_API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      // На 403: invalidate токен, retry один раз
      if (response.status === 403) {
        this.invalidateToken();
        const newToken = await this.getToken();
        headers.Authorization = `Bearer ${newToken}`;

        response = await fetch(`${AVITO_API}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText || response.statusText}`,
        };
      }

      // Некоторые эндпоинты возвращают пустой body (204)
      if (response.status === 204) {
        return { success: true, data: undefined as T };
      }

      const data = await response.json();
      return { success: true, data: data as T };
    } catch (error) {
      console.error(`[AvitoClient] ${method} ${path} error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Ошибка запроса к Avito API",
      };
    }
  }

  // --- User ---

  async getSelf(): Promise<AvitoResult<AvitoSelf>> {
    return this.request<AvitoSelf>("GET", "/core/v1/accounts/self");
  }

  async getBalance(): Promise<AvitoResult<AvitoBalance>> {
    return this.request<AvitoBalance>("GET", `/core/v1/accounts/${this.avitoUserId}/balance/`);
  }

  // --- Items (rate limit: 25/min!) ---

  async getItems(params?: AvitoGetItemsParams): Promise<AvitoResult<AvitoItemsResponse>> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", params.page.toString());
    if (params?.per_page) query.set("per_page", params.per_page.toString());
    if (params?.status) query.set("status", params.status);
    if (params?.updatedAtFrom) query.set("updatedAtFrom", params.updatedAtFrom);
    if (params?.category) query.set("category", params.category.toString());

    const qs = query.toString();
    return this.request<AvitoItemsResponse>("GET", `/core/v1/items${qs ? `?${qs}` : ""}`);
  }

  async getItemInfo(itemId: number): Promise<AvitoResult<AvitoItemInfo>> {
    return this.request<AvitoItemInfo>(
      "GET",
      `/core/v1/accounts/${this.avitoUserId}/items/${itemId}/`
    );
  }

  // --- Messenger ---

  async getChats(params?: AvitoGetChatsParams): Promise<AvitoResult<AvitoChatsResponse>> {
    const query = new URLSearchParams();
    // По умолчанию u2i — для всех типов передаём u2i,u2u
    query.set("chat_types", params?.chat_types || "u2i,u2u");
    if (params?.unread_only) query.set("unread_only", "true");
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    if (params?.item_ids?.length) {
      query.set("item_ids", params.item_ids.join(","));
    }

    return this.request<AvitoChatsResponse>(
      "GET",
      `/messenger/v2/accounts/${this.avitoUserId}/chats?${query}`
    );
  }

  // v3 endpoint — возвращает { messages: AvitoApiMessage[] }
  async getChatMessages(chatId: string): Promise<AvitoResult<AvitoMessagesResponse>> {
    // Trailing slash обязателен для v3!
    return this.request<AvitoMessagesResponse>(
      "GET",
      `/messenger/v3/accounts/${this.avitoUserId}/chats/${chatId}/messages/`
    );
  }

  async sendMessage(chatId: string, text: string): Promise<AvitoResult<AvitoSendMessageResponse>> {
    // type на корневом уровне, не внутри message!
    return this.request<AvitoSendMessageResponse>(
      "POST",
      `/messenger/v1/accounts/${this.avitoUserId}/chats/${chatId}/messages`,
      { message: { text }, type: "text" }
    );
  }

  async markChatRead(chatId: string): Promise<AvitoResult<void>> {
    return this.request<void>(
      "POST",
      `/messenger/v1/accounts/${this.avitoUserId}/chats/${chatId}/read`
    );
  }

  // --- Webhook ---

  async registerWebhook(url: string): Promise<AvitoResult<void>> {
    return this.request<void>("POST", "/messenger/v3/webhook", { url });
  }

  async unregisterWebhook(url: string): Promise<AvitoResult<void>> {
    return this.request<void>("POST", "/messenger/v1/webhook/unsubscribe", { url });
  }

  /** Получить список текущих webhook-подписок */
  async getWebhookSubscriptions(): Promise<AvitoResult<AvitoSubscriptionsResponse>> {
    return this.request<AvitoSubscriptionsResponse>("POST", "/messenger/v1/subscriptions");
  }

  // --- Messenger: Изображения ---

  /** Загрузить изображение (шаг 1). Возвращает image_id для sendImageMessage. */
  async uploadImage(
    imageBuffer: Buffer,
    filename: string
  ): Promise<AvitoResult<AvitoUploadImageResponse>> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)]);
    formData.append("image", blob, filename);
    return this.requestFormData<AvitoUploadImageResponse>(
      `/messenger/v1/accounts/${this.avitoUserId}/uploadImages`,
      formData
    );
  }

  /** Отправить изображение в чат (шаг 2, после uploadImage). */
  async sendImageMessage(
    chatId: string,
    imageId: string
  ): Promise<AvitoResult<AvitoSendImageMessageResponse>> {
    return this.request<AvitoSendImageMessageResponse>(
      "POST",
      `/messenger/v1/accounts/${this.avitoUserId}/chats/${chatId}/messages/image`,
      { image_id: imageId }
    );
  }

  // --- Messenger: Управление ---

  /** Удалить сообщение (в течение 1ч после отправки). Тип меняется на "deleted". */
  async deleteMessage(chatId: string, messageId: string): Promise<AvitoResult<void>> {
    return this.request<void>(
      "DELETE",
      `/messenger/v1/accounts/${this.avitoUserId}/chats/${chatId}/messages/${messageId}`
    );
  }

  /** Получить информацию по конкретному чату (v2). */
  async getChatInfo(chatId: string): Promise<AvitoResult<AvitoChatInfoResponse>> {
    return this.request<AvitoChatInfoResponse>(
      "GET",
      `/messenger/v2/accounts/${this.avitoUserId}/chats/${chatId}`
    );
  }

  /** Добавить пользователя в чёрный список (не получать сообщения от него). */
  async addToBlacklist(chatId: string): Promise<AvitoResult<void>> {
    return this.request<void>("POST", `/messenger/v2/accounts/${this.avitoUserId}/blacklist`, {
      chat_id: chatId,
    });
  }

  /** Получить голосовые сообщения. */
  async getVoiceFiles(messageIds: string[]): Promise<AvitoResult<AvitoVoiceFilesResponse>> {
    const query = new URLSearchParams({ message_ids: messageIds.join(",") });
    return this.request<AvitoVoiceFilesResponse>(
      "GET",
      `/messenger/v1/accounts/${this.avitoUserId}/getVoiceFiles?${query}`
    );
  }

  // --- Ratings & Reviews ---

  /** Получить информацию о рейтинге. */
  async getRatingInfo(): Promise<AvitoResult<AvitoRatingInfo>> {
    const result = await this.request<AvitoRatingInfoRaw>("GET", `/ratings/v1/info`);
    if (!result.success) return result;
    return {
      success: true,
      data: {
        score: result.data.rating.score,
        total_reviews: result.data.rating.reviewsWithScoreCount,
      },
    };
  }

  /** Получить отзывы. */
  async getReviews(offset = 0, limit = 50): Promise<AvitoResult<AvitoReviewsResponse>> {
    const query = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });
    return this.request<AvitoReviewsResponse>("GET", `/ratings/v1/reviews?${query}`);
  }

  /** Ответить на отзыв. */
  async replyToReview(reviewId: number, text: string): Promise<AvitoResult<void>> {
    return this.request<void>("POST", `/ratings/v1/answers`, {
      review_id: reviewId,
      text,
    });
  }

  // --- Promotion ---

  /** Получить стоимость доп. услуг для объявления. */
  async getVasPrices(itemId: number): Promise<AvitoResult<AvitoVasPricesResponse>> {
    return this.request<AvitoVasPricesResponse>(
      "POST",
      `/core/v1/accounts/${this.avitoUserId}/price/vas`,
      { item_ids: [itemId] }
    );
  }

  /** Применить доп. услугу продвижения к объявлению. */
  async applyVas(itemId: number, vasId: string): Promise<AvitoResult<AvitoApplyVasResponse>> {
    return this.request<AvitoApplyVasResponse>(
      "PUT",
      `/core/v1/accounts/${this.avitoUserId}/items/${itemId}/vas`,
      { vas_id: vasId }
    );
  }

  // --- Items: Управление ценой (rate limit: 150/min) ---

  /** Обновить цену объявления. */
  async updateItemPrice(
    itemId: number,
    price: number
  ): Promise<AvitoResult<AvitoUpdatePriceResponse>> {
    return this.request<AvitoUpdatePriceResponse>("POST", `/core/v1/items/${itemId}/update_price`, {
      price,
    });
  }

  // --- Stats V2 (расширенная аналитика) ---
  // POST /stats/v2/accounts/{user_id}/items
  // Возвращает views (просмотры с уникализацией за сутки), impressions, contacts, favorites и др.
  // grouping: "item" — сгруппировать по объявлениям (до 1000 штук с пагинацией)

  /** Расширенная статистика по объявлениям (v2). */
  async getItemStatsV2(
    dateFrom: string,
    dateTo: string,
    metrics: string[] = ["views", "contacts", "favorites"],
    grouping: "day" | "week" | "month" | "item" | "totals" = "item"
  ): Promise<AvitoResult<AvitoItemStatsV2Response>> {
    const body: AvitoItemStatsV2Request = {
      dateFrom,
      dateTo,
      metrics,
      grouping,
      limit: 1000,
      offset: 0,
    };
    return this.request<AvitoItemStatsV2Response>(
      "POST",
      `/stats/v2/accounts/${this.avitoUserId}/items`,
      body
    );
  }

  // --- User: Финансы ---

  /** История финансовых операций (расходы на продвижение, платежи и т.д.). */
  async getOperationsHistory(
    datetimeFrom: string,
    datetimeTo: string
  ): Promise<AvitoResult<AvitoOperationsHistoryResponse>> {
    return this.request<AvitoOperationsHistoryResponse>(
      "POST",
      `/core/v1/accounts/operations_history`,
      { datetime_from: datetimeFrom, datetime_to: datetimeTo }
    );
  }

  // --- Ratings: Удаление ответа ---

  /** Удалить свой ответ на отзыв. */
  async deleteReviewAnswer(answerId: number): Promise<AvitoResult<void>> {
    return this.request<void>("DELETE", `/ratings/v1/answers/${answerId}`);
  }

  // --- Autoload (Автозагрузка) ---

  /** Получить профиль автозагрузки (расписание, URL фида). */
  async getAutoloadProfile(): Promise<AvitoResult<AvitoAutoloadProfile>> {
    return this.request<AvitoAutoloadProfile>("GET", "/autoload/v2/profile");
  }

  /** Обновить профиль автозагрузки. */
  async updateAutoloadProfile(profile: Partial<AvitoAutoloadProfile>): Promise<AvitoResult<void>> {
    return this.request<void>("POST", "/autoload/v2/profile", profile);
  }

  /** Получить список отчётов автозагрузки. */
  async getAutoloadReports(): Promise<AvitoResult<AvitoAutoloadReportsResponse>> {
    return this.request<AvitoAutoloadReportsResponse>("GET", "/autoload/v2/reports");
  }

  /** Получить последний завершённый отчёт. */
  async getLastAutoloadReport(): Promise<AvitoResult<AvitoAutoloadReportsResponse>> {
    return this.request<AvitoAutoloadReportsResponse>(
      "GET",
      "/autoload/v3/reports/last_completed_report"
    );
  }

  /** Получить позиции из отчёта автозагрузки. */
  async getAutoloadReportItems(
    reportId: number,
    page = 1,
    perPage = 100
  ): Promise<AvitoResult<AvitoAutoloadReportItemsResponse>> {
    const query = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    return this.request<AvitoAutoloadReportItemsResponse>(
      "GET",
      `/autoload/v2/reports/${reportId}/items?${query}`
    );
  }

  /** Загрузить файл автозагрузки (XML/CSV). Макс. 1 раз/час. */
  async uploadAutoloadFile(fileBuffer: Buffer, filename: string): Promise<AvitoResult<void>> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)]);
    formData.append("file", blob, filename);
    return this.requestFormData<void>("/autoload/v1/upload", formData);
  }

  /** Конвертация ID из файла → Avito ID. */
  async getAutoloadAvitoIds(adIds: string[]): Promise<AvitoResult<AvitoAutoloadIdMappingResponse>> {
    const query = new URLSearchParams({ query: adIds.join(",") });
    return this.request<AvitoAutoloadIdMappingResponse>(
      "GET",
      `/autoload/v2/items/avito_ids?${query}`
    );
  }

  // --- Stock Management (Управление остатками) ---

  /** Получить остатки по объявлению. */
  async getStocks(itemId: number): Promise<AvitoResult<AvitoStocksResponse>> {
    return this.request<AvitoStocksResponse>(
      "GET",
      `/stock-management/v1/accounts/${this.avitoUserId}/items/${itemId}/stocks`
    );
  }

  /** Обновить остатки объявления (размеры, количество). */
  async updateStocks(itemId: number, stocks: AvitoStockItem[]): Promise<AvitoResult<void>> {
    return this.request<void>(
      "PUT",
      `/stock-management/v1/accounts/${this.avitoUserId}/items/${itemId}/stocks`,
      { stocks }
    );
  }

  /** Обновить статус заказа (для DBS). */
  async updateOrderStatus(orderId: number, status: string): Promise<AvitoResult<void>> {
    return this.request<void>("POST", `/order-management/v1/orders/${orderId}/status`, { status });
  }

  /** Отправить трек-номер для заказа (DBS — доставка продавцом). */
  async sendOrderTracking(orderId: number, trackingNumber: string): Promise<AvitoResult<void>> {
    return this.request<void>("POST", `/order-management/v1/orders/${orderId}/tracking`, {
      tracking_number: trackingNumber,
    });
  }
}

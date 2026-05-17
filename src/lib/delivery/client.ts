import type { TrackGlobalResponse, TrackingResult } from "./types";
import { mapTrackGlobalAction } from "./status-mapper";

const TRACK_GLOBAL_API = "https://track-global.p.rapidapi.com";

/**
 * Клиент для работы с Track.global API (через RapidAPI)
 *
 * Эндпоинт: GET /search?track=TRACKING_NUMBER
 * Автоопределение курьера встроено.
 *
 * Лимиты (Pro $5/мес):
 * - 5000 запросов в месяц
 * - 5 запросов в секунду
 */
export class DeliveryClient {
  private rapidApiKey: string;
  private bearerToken: string;

  constructor(rapidApiKey: string, bearerToken: string) {
    if (!rapidApiKey) {
      throw new Error("TRACK_GLOBAL_RAPIDAPI_KEY is required");
    }
    if (!bearerToken) {
      throw new Error("TRACK_GLOBAL_BEARER_TOKEN is required");
    }
    this.rapidApiKey = rapidApiKey;
    this.bearerToken = bearerToken;
  }

  /**
   * Получить статус трекинга по номеру
   *
   * Track.global автоматически определяет курьера по трек-номеру.
   * Параметр courierSlug не требуется (оставлен для обратной совместимости).
   */
  async getStatus(
    trackingNumber: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _courierSlug?: string
  ): Promise<TrackingResult> {
    try {
      const url = new URL(`${TRACK_GLOBAL_API}/search`);
      url.searchParams.set("track", trackingNumber);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-rapidapi-key": this.rapidApiKey,
          "x-rapidapi-host": "track-global.p.rapidapi.com",
          Authorization: `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data: TrackGlobalResponse = await response.json();

      if (data.status !== "success" || !data.data || data.data.status === 0) {
        return {
          success: false,
          error: data.message || "Трек-номер не найден",
        };
      }

      const events = data.data.result.events;
      const lastEvent = events[0]; // Первый — самый свежий

      // Определяем курьера из found_in_services
      const services = data.data.result.found_in_services;
      const firstServiceKey = Object.keys(services)[0];
      const firstService = firstServiceKey ? services[firstServiceKey] : null;

      return {
        success: true,
        data: {
          trackingNumber: data.data.track,
          courierSlug: firstService?.alias || firstServiceKey || "unknown",
          courierName: firstService?.name || "Unknown",
          currentStatus: lastEvent?.action || "unknown",
          currentStatusText: lastEvent?.translated_action || lastEvent?.action || "Неизвестно",
          mappedStatus: mapTrackGlobalAction(lastEvent?.action || ""),
          lastUpdate: lastEvent?.date ? new Date(lastEvent.date) : null,
          checkpoints: events.map((e) => ({
            date: e.date,
            text: e.translated_action || e.action,
            location: e.location?.city ? `${e.location.city}, ${e.location.country}` : undefined,
          })),
        },
      };
    } catch (error) {
      console.error("[DeliveryClient] getStatus error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Ошибка запроса",
      };
    }
  }
}

/**
 * Создать клиент с ключами из env
 */
export function createDeliveryClient(): DeliveryClient {
  const rapidApiKey = process.env.TRACK_GLOBAL_RAPIDAPI_KEY;
  const bearerToken = process.env.TRACK_GLOBAL_BEARER_TOKEN;

  if (!rapidApiKey) {
    throw new Error("TRACK_GLOBAL_RAPIDAPI_KEY environment variable is not set");
  }
  if (!bearerToken) {
    throw new Error("TRACK_GLOBAL_BEARER_TOKEN environment variable is not set");
  }

  return new DeliveryClient(rapidApiKey, bearerToken);
}

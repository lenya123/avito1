import type { OrderStatus } from "@/types/database";

/**
 * Событие трекинга (checkpoint) от Track.global
 */
export interface TrackGlobalEvent {
  /** Описание события на английском */
  action: string;
  /** Локация события */
  location: {
    city: string;
    country: string;
  };
  /** Slug службы доставки */
  service: string;
  /** Язык оригинала */
  language: string;
  /** Дата события (формат: "YYYY-MM-DD HH:mm:ss") */
  date: string;
  /** Дата и время раздельно */
  separate_date: {
    date: string;
    time: string;
  };
  /** Лого службы доставки */
  image_path: string;
  /** Перевод action на русский */
  translated_action: string;
}

/**
 * Информация о найденной службе доставки
 */
export interface TrackGlobalService {
  id: number;
  name: string;
  alias: string;
  image_path?: string;
}

/**
 * Ответ от Track.global API (GET /search)
 */
export interface TrackGlobalResponse {
  status: "success" | "error";
  message: string | null;
  data: {
    /** 1 = найден, 0 = не найден */
    status: number;
    fromLocation: string;
    toLocation: string;
    fromFlag: string;
    toFlag: string;
    track: string;
    from: string;
    to: string;
    /** Дней в пути */
    days: string;
    dimensions: {
      weight: number;
      measure: string;
    };
    information: string | null;
    result: {
      /** Массив событий (первый — самый свежий) */
      events: TrackGlobalEvent[];
      /** Службы, в которых найден трек */
      found_in_services: Record<string, TrackGlobalService>;
    };
    checkedServices: Record<string, Omit<TrackGlobalService, "image_path">>;
    lastCheckedAt: string;
    strategy: string;
  } | null;
}

/**
 * Результат трекинга (унифицированный внутренний формат)
 */
export interface TrackingResult {
  success: boolean;
  data?: {
    trackingNumber: string;
    courierSlug: string;
    courierName: string;
    currentStatus: string;
    currentStatusText: string;
    mappedStatus: OrderStatus;
    lastUpdate: Date | null;
    checkpoints: TrackingCheckpoint[];
  };
  error?: string;
}

/**
 * Унифицированный checkpoint для внутреннего использования
 */
export interface TrackingCheckpoint {
  date: string;
  text: string;
  location?: string;
}

/**
 * Службы доставки, поддерживающие автотрекинг через Track.global
 *
 * Yandex НЕ поддерживается — управляется вручную
 */
export const TRACKABLE_DELIVERY_SERVICES = ["cdek", "pochta", "5post"] as const;

export type TrackableDeliveryService = (typeof TRACKABLE_DELIVERY_SERVICES)[number];

/**
 * Проверить, поддерживает ли служба автотрекинг
 */
export function isTrackableService(service: string): service is TrackableDeliveryService {
  return (TRACKABLE_DELIVERY_SERVICES as readonly string[]).includes(service);
}

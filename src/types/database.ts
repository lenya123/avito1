// Реэкспортируем сгенерированные типы
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./database.generated";
export { Constants } from "./database.generated";

// Импортируем для использования в алиасах
import type { Tables as TablesType } from "./database.generated";

// =====================================================
// Вспомогательные типы
// =====================================================

// BUSINESS_LOGIC.md §4.2 — 8 статусов клиентского заказа +
// 3 Авито-only (см. §15 канона и ТЗ Авито-заказы §5.1).
// Печать стикера — внутрянка отправщика, не статус (флаг barcode_printed).
export type OrderStatus =
  | "paid"
  | "collecting"
  | "sent"
  | "return"
  | "return_done"
  | "trash"
  | "cancelled"
  | "problem"
  // Avito-only ветки (source='avito'):
  | "awaiting_size"      // создан, размер неизвестен; мини-AI уточняет
  | "delivered"          // покупатель забрал из ПВЗ (терминальный успех)
  | "return_in_transit"; // возврат в пути на ПВЗ (с expected_return_date)

export type FraudAlertType =
  | "duplicate_fingerprint"
  | "rapid_orders"
  | "return_abuse"
  | "suspicious_cancellation";

export type UserRole = "owner" | "shipper" | "admin";

export type ProblemType = "out_of_stock" | "bad_barcode";

export type OrderSource = "drop" | "avito" | "manual";

export type DeliveryService = "avito" | "yandex" | "cdek" | "pochta" | "5post";

export type PaymentType = "order" | "orders_batch";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export type ExpenseCategory = "purchase" | "shipping" | "salary" | "marketing" | "other";

// =====================================================
// Алиасы для удобства
// =====================================================

export type User = TablesType<"users">;
export type Product = TablesType<"products">;
export type ProductSize = TablesType<"product_sizes">;
export type Order = TablesType<"orders">;
export type Payment = TablesType<"payments">;
export type Supplier = TablesType<"suppliers">;
export type PickupPoint = TablesType<"pickup_points">;
export type Favorite = TablesType<"favorites">;
export type ProductNotification = TablesType<"product_notifications">;
export type ShipperStat = TablesType<"shipper_stats">;
export type ShipperPayout = TablesType<"shipper_payouts">;
export type ShipperRateTier = TablesType<"shipper_rate_tiers">;
export type Expense = TablesType<"expenses">;
export type ActivityLog = TablesType<"activity_log">;
export type Notification = TablesType<"notifications">;
export type Settings = TablesType<"settings">;
export type SizeReservation = TablesType<"size_reservations">;
export type UserFingerprint = TablesType<"user_fingerprints">;
export type FraudAlert = TablesType<"fraud_alerts">;

// =====================================================
// Расширенные типы
// =====================================================

export type ProductWithSizes = Product & {
  sizes: ProductSize[];
};

export type StatusHistoryEntry = {
  status: string;
  timestamp: string;
};

export type OrderWithDetails = Order & {
  product: Product;
  product_size: ProductSize;
  client: User;
};

// =====================================================
// Avito Integration
// =====================================================

export type AvitoItem = TablesType<"avito_items">;
export type AvitoChat = TablesType<"avito_chats">;
export type AvitoMessage = TablesType<"avito_messages">;

// =====================================================
// AI Sales Agent
// =====================================================

export type AiSalesSettings = TablesType<"ai_sales_settings">;
export type AiSalesPromptVersion = TablesType<"ai_sales_prompt_versions">;
export type AiSalesDraft = TablesType<"ai_sales_drafts">;
export type AiSalesCorrection = TablesType<"ai_sales_corrections">;
export type AiSalesDailyStat = TablesType<"ai_sales_daily_stats">;
export type AvitoItemProductMapping = TablesType<"avito_item_product_mapping">;

export type AiSalesMode = "draft" | "auto_simple" | "auto_full";
export type AiSalesDraftStatus = "pending" | "approved" | "rejected" | "expired" | "auto_sent";
export type AiSalesCorrectionType = "tone" | "factual" | "pricing" | "sizing" | "urgency" | "other";

export type FewShotExample = {
  buyer_message: string;
  seller_response: string;
  context_notes?: string;
};

export type SalesDraftResult = {
  draft: string;
  confidence: number;
  reasoning: string;
  tokensUsed: number;
  generationTimeMs: number;
};

export type SalesContext = {
  avitoItemTitle: string;
  avitoItemPrice: number | null;
  avitoItemUrl: string | null;
  buyerName: string;
  chatHistory: Array<{ role: "buyer" | "seller"; text: string }>;
  product?: {
    name: string;
    dropPrice: number | null;
    measurements: Record<string, Record<string, number>> | null;
    availableSizes: string[];
    totalStock: number;
  };
};

// ============================================================================
// Avito Media Presets / Post Jobs / Stats — добавлено из avito-merge
// ============================================================================

export type AvitoMediaPresetKind =
  | "preview"
  | "cover"
  | "photoset"
  | "ai-preview"
  | "photozone"
  | "personality";
export type AvitoMediaPresetSource = "manual" | "generated";

export interface AvitoMediaPreset {
  id: string;
  user_id: string;
  kind: AvitoMediaPresetKind;
  set_key: string | null;
  storage_path: string;
  public_url: string | null;
  source: AvitoMediaPresetSource;
  product_id: string | null;
  sort_order: number;
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvitoPhotosetSet {
  id: string;
  user_id: string;
  set_key: string;
  title: string | null;
  photo_count: number;
  usage_count: number;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export type AvitoAiPhotoCategory = "normal" | "photozone" | "personality";

export interface AvitoAiGenCounter {
  id: string;
  user_id: string;
  product_id: string;
  gen_date: string;
  category: AvitoAiPhotoCategory;
  used_count: number;
  created_at: string;
}

export type AvitoAiGenerationStatus = "pending" | "approved" | "rejected" | "regenerating";

export interface AvitoAiGeneration {
  id: string;
  user_id: string;
  product_id: string;
  category: AvitoAiPhotoCategory;
  status: AvitoAiGenerationStatus;
  storage_path: string;
  public_url: string | null;
  reference_preset_id: string | null;
  source_photoset_set_key: string | null;
  prompt: string | null;
  tg_chat_id: number | null;
  tg_message_id: number | null;
  attempt: number;
  approved_preset_id: string | null;
  created_at: string;
  updated_at: string;
}

export type AvitoPostJobStatus =
  | "queued"
  | "processing"
  | "published"
  | "failed"
  | "cancelled";

export interface AvitoPostJobPhotoPlan {
  cover: { source: "preset" | "generated"; preset_id?: string; storage_path?: string };
  photoset: { preset_set_key: string; count: number };
}

/**
 * Предзаготовленные фото выкладки (Variant A): синхронный POST уникализирует
 * 10 фото и кладёт сюда их пути в бакете `avito-presets/{user}/publish/{batch}/`.
 * Воркер скачивает их и публикует без пере-микса. Чистка — см.
 * `removePreparedImages` (lib/avito/prepared-images.ts).
 */
export interface AvitoPostJobPreparedImages {
  paths: string[];
  coverPresetId: string | null;
  photosetSetKey: string | null;
  coverGenerated: boolean;
  plan: AvitoPostJobPhotoPlan | null;
}

export interface AvitoPostJob {
  id: string;
  user_id: string;
  session_id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  price: number;
  city: string | null;
  metro: string | null;
  status: AvitoPostJobStatus;
  attempts: number | null;
  photo_plan: AvitoPostJobPhotoPlan | null;
  prepared_images: AvitoPostJobPreparedImages | null;
  error_message: string | null;
  avito_item_id: string | null;
  avito_item_url: string | null;
  published_at: string | null;
  created_at: string;
  manual_set_key: string | null;
  manual_cover_preset_id: string | null;
}

export interface AvitoItemStatsDaily {
  id: string;
  user_id: string;
  session_id: string;
  avito_item_id: number;
  date: string;
  views: number | null;
  contacts: number | null;
  favorites: number | null;
  synced_at: string;
}

export interface AvitoPromotionDaily {
  id: string;
  user_id: string;
  session_id: string;
  date: string;
  amount: number | null;
  synced_at: string;
}

export type AvitoBrowserSessionExt = {
  id: string;
  user_id: string;
  account_index: number;
  status: string;
  cookies: unknown;
  user_agent: string | null;
  proxy_url: string | null;
  avito_login: string | null;
  avito_password_enc: string | null;
  browser_fingerprint: unknown;
  last_sync_at: string | null;
  last_login_at: string | null;
  error_message: string | null;
  sms_code: string | null;
};

export type AvitoItemExt = AvitoItem & {
  product_id?: string | null;
  product_name?: string | null;
  product_photo_url?: string | null;
};

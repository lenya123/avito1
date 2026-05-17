// Реэкспортируем сгенерированные типы
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./database.generated";
export { Constants } from "./database.generated";

// Импортируем для использования в алиасах
import type { Tables as TablesType } from "./database.generated";

// =====================================================
// Вспомогательные типы
// =====================================================

export type OrderStatus =
  | "awaiting_shipment"
  | "collecting"
  | "in_transit"
  | "completed"
  | "return_in_transit"
  | "return_arrived"
  | "return_completed"
  | "cancelled"
  | "problem"
  | "trash"
  | "disposed";

export type FraudAlertType =
  | "duplicate_fingerprint"
  | "self_referral"
  | "rapid_orders"
  | "deposit_abuse"
  | "return_abuse"
  | "suspicious_cancellation";

export type UserRole = "owner" | "shipper" | "client";

export type SubscriptionTier = "none" | "basic" | "premium" | "top_floor_boss";

export type ProblemType = "out_of_stock" | "bad_barcode";

export type OrderSource = "drop" | "avito" | "manual";

export type DeliveryService = "avito" | "yandex" | "cdek" | "pochta" | "5post";

export type PaymentType = "subscription" | "order" | "orders_batch" | "deposit_topup";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export type ExpenseCategory = "purchase" | "shipping" | "salary" | "marketing" | "other";

// =====================================================
// Алиасы для удобства
// =====================================================

// Конкретные типы
export type User = TablesType<"users">;
export type Product = TablesType<"products">;
export type ProductSize = TablesType<"product_sizes">;
export type Order = TablesType<"orders">;
export type Payment = TablesType<"payments">;
export type Supplier = TablesType<"suppliers">;
export type PickupPoint = TablesType<"pickup_points">;
export type Favorite = TablesType<"favorites">;
export type ProductNotification = TablesType<"product_notifications">;
export type ReferralBonus = TablesType<"referral_bonuses">;
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
// Расширенные типы с отношениями
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

export type UserWithStats = User & {
  orders_count: number;
  total_spent: number;
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
    brand: string | null;
    dropPrice: number | null;
    measurements: Record<string, Record<string, number>> | null;
    availableSizes: string[];
    totalStock: number;
  };
};

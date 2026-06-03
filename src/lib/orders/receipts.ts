/**
 * Чеки оплаты заказа — единый интерфейс поверх двух источников.
 *
 * BUSINESS_LOGIC §7: заказ может быть оплачен двумя путями:
 *   1. Обычная оплата — клиент шлёт чек, Vision/директор подтверждает,
 *      файл лежит в `receipts/pending/...` → копируется в
 *      `orders.receipt_storage_path` при `confirm_pending_order_atomic`.
 *   2. +ВАЙБ-погашение долга — клиент шлёт чек на сумму, Vision/директор
 *      подтверждает, создаётся `vibe_payments` (с linkage через
 *      `vibe_payment_orders`). Файл лежит в `receipts/vibe/...`.
 *
 * Один заказ может быть погашен **несколькими** vibe-чеками (по частям),
 * и наоборот — один vibe-чек может погасить несколько заказов
 * (multi-select wizard). Поэтому возврат — массив.
 *
 * Слияние двух источников делает RPC `public.get_order_receipts` —
 * это единственное место знающее обе таблицы. Здесь только типизация
 * + скачивание файла.
 *
 * ⚠️ Имя поля `vibe_payments.receipt_file_url` обманчиво: фактически в
 * нём хранится **storage path в bucket `receipts`** (см.
 * `recognize-receipt.ts:80` — `receipt_file_url: data.filePath` где
 * filePath это storagePath из предыдущего upload). Это техдолг
 * (rename column + миграция всех читателей); прозрачен снаружи —
 * RPC возвращает поле `storage_path` уже унифицированно.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

type Supabase = SupabaseClient<Database>;

export type OrderReceiptSource = "direct" | "vibe";

export interface OrderReceipt {
  /** Путь в Supabase Storage bucket `receipts`. */
  storagePath: string;
  /** Источник чека — обычная оплата или +ВАЙБ. */
  source: OrderReceiptSource;
  /** Когда чек был получен (ISO-строка) — для сортировки и подписи. */
  receivedAt: string | null;
  /**
   * Для vibe-чека — id `vibe_payments`. Полезен если UI хочет
   * провалиться в детали платежа.
   */
  vibePaymentId: string | null;
}

/**
 * Все подтверждённые чеки оплаты заказа в хронологическом порядке.
 * Пустой массив, если чеков нет. При ошибке БД логирует и возвращает [].
 * Это UI-helper: он не должен ломать рендер карточки.
 */
export async function getOrderReceipts(
  supabase: Supabase,
  orderId: string
): Promise<OrderReceipt[]> {
  const { data, error } = await supabase.rpc("get_order_receipts", { p_order_id: orderId });
  if (error) {
    console.error("[orders/receipts] get_order_receipts RPC failed:", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    storagePath: row.storage_path,
    source: row.source === "vibe" ? "vibe" : "direct",
    receivedAt: row.received_at,
    vibePaymentId: row.vibe_payment_id,
  }));
}

/**
 * Скачивает файл чека из bucket `receipts` и возвращает Buffer.
 * Возвращает null если файл недоступен. Сделан отдельным helper'ом —
 * чтобы любые читатели (Telegram-боты, Owner Panel) единообразно
 * получали байты для пересылки или показа.
 *
 * TTL signed URL — 5 минут; для разовой пересылки этого достаточно.
 */
export async function downloadOrderReceipt(
  supabase: Supabase,
  storagePath: string
): Promise<{ buffer: Buffer; isPdf: boolean } | null> {
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) {
    console.error("[orders/receipts] createSignedUrl failed:", error, "path:", storagePath);
    return null;
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok) {
    console.error("[orders/receipts] download failed:", response.status, "path:", storagePath);
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const isPdf = storagePath.toLowerCase().endsWith(".pdf");
  return { buffer, isPdf };
}

/**
 * GET /api/owner/orders/[id]/receipt-url
 *
 * Возвращает signed URL'ы чека(ов) клиента из private-bucket `receipts`
 * для секции «Чек оплаты» на странице заказа.
 *
 * Источники (объединяются, дедуп по пути файла):
 *  1. `orders.receipt_storage_path` — ОСНОВНОЙ путь современного потока:
 *     чек кладётся в `receipts/pending/{pendingId}/...`, а
 *     `confirm_pending_order_atomic` переносит путь на созданный заказ.
 *  2. `order_messages(kind='receipt', inbound)` — легаси-путь (чек,
 *     присланный против уже существующего заказа).
 */

import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 минут

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const receipts: Array<{ url: string; createdAt: string }> = [];
  const seenPaths = new Set<string>();

  const sign = async (filePath: string, createdAt: string) => {
    if (!filePath || seenPaths.has(filePath)) return;
    const { data: signed, error: signedError } = await supabase.storage
      .from("receipts")
      .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
    if (signedError || !signed?.signedUrl) {
      console.warn("receipt-url createSignedUrl failed:", signedError, filePath);
      return;
    }
    seenPaths.add(filePath);
    receipts.push({ url: signed.signedUrl, createdAt });
  };

  // 1. Основной путь — orders.receipt_storage_path (перенесён из pending).
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("receipt_storage_path, paid_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (orderError) {
    console.error("receipt-url fetch order failed:", orderError);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }

  if (order?.receipt_storage_path) {
    await sign(
      order.receipt_storage_path,
      order.paid_at ?? order.created_at ?? new Date().toISOString()
    );
  }

  // 2. Легаси-путь — order_messages (чек против существующего заказа).
  const { data: messages, error: msgError } = await supabase
    .from("order_messages")
    .select("metadata, created_at")
    .eq("order_id", id)
    .eq("kind", "receipt")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(5);

  if (msgError) {
    console.error("receipt-url fetch order_messages failed:", msgError);
    // не валим весь ответ — основной путь мог уже дать чек
  } else {
    for (const m of messages ?? []) {
      const meta = m.metadata as { file_path?: string } | null;
      if (meta?.file_path) await sign(meta.file_path, m.created_at);
    }
  }

  return NextResponse.json({ receipts });
}

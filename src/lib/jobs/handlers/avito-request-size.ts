/**
 * BullMQ handler: avito-request-size
 *
 * Минимальный мини-AI продажник для уточнения размера (ТЗ §4.2 п.2).
 *
 * Срабатывает, когда заказ переходит в `awaiting_size`. Шлёт покупателю
 * в Авито-чат шаблонное сообщение со списком доступных размеров и
 * логирует исходящее сообщение в `avito_messages` (is_ai_generated=true).
 *
 * Если объявление не привязано к товару → отправку пропускаем, в
 * `system_comment` уже стоит причина, владелец увидит DM (см. caller).
 *
 * Полноценный AI (с обработкой возражений, контекстом) — следующая
 * итерация поверх этой минималки (владелец доделает).
 */

import type { Job } from "bullmq";
import { createServiceClientLoose } from "@/lib/supabase/server";
import { sendAvitoWebMessage, type BrowserSession } from "@/lib/avito/web-client";

export interface AvitoRequestSizeJobData {
  orderId: string;
}

export async function handleAvitoRequestSize(job: Job<AvitoRequestSizeJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = createServiceClientLoose();

  // 1) Достаём заказ.
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, source, product_id, avito_order_id, system_comment"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.source !== "avito" || order.status !== "awaiting_size") {
    console.log(`[avito-request-size] skip order ${orderId}: not in awaiting_size`);
    return;
  }
  if (!order.product_id) {
    console.log(`[avito-request-size] skip order ${orderId}: no product_id (объявление не привязано)`);
    return;
  }

  // 2) Доступные размеры товара (с положительным остатком).
  const { data: sizes } = await supabase
    .from("product_sizes")
    .select("size, current_quantity")
    .eq("product_id", order.product_id)
    .gt("current_quantity", 0);

  const available = (sizes ?? [])
    .map((s: { size: string }) => s.size)
    .filter((s) => s && s.length > 0);

  if (available.length === 0) {
    console.log(`[avito-request-size] order ${orderId}: товар без остатков, эскалация`);
    await escalateToOwner(supabase, order.id, "Все размеры распроданы");
    return;
  }

  // 3) Находим чат покупателя по avito_order_id.
  // Avito API связывает заказ с чатом через item + buyer; для простоты
  // ищем последний чат сессии по item, в котором есть входящие.
  // (Полное соответствие — отдельная задача, требует пробы API.)
  const chat = await findChatForOrder(supabase, order.avito_order_id);
  if (!chat) {
    console.log(`[avito-request-size] order ${orderId}: chat не найден, оставляем awaiting_size`);
    return;
  }

  const sessionRow = await loadSession(supabase, chat.session_id);
  if (!sessionRow) return;

  // 4) Формируем шаблон.
  const sizesList = available.join(", ");
  const text =
    `Здравствуйте! Спасибо за заказ. ` +
    `Подскажите, пожалуйста, какой размер Вам нужен? Доступны: ${sizesList}.`;

  // 5) Шлём в Авито-чат.
  try {
    await sendAvitoWebMessage(sessionRow, chat.avito_chat_id, text);
  } catch (e) {
    console.error(`[avito-request-size] send failed for order ${orderId}:`, (e as Error).message);
    return;
  }

  // 6) Логируем исходящее в avito_messages (is_ai_generated=true).
  await supabase.from("avito_messages").insert({
    chat_id: chat.id,
    direction: "out",
    content_text: text,
    is_ai_generated: true,
    created_at: new Date().toISOString(),
  });

  console.log(
    `[avito-request-size] order ${orderId}: запросили размер (${sizesList}) в чат ${chat.id}`
  );
}

async function findChatForOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  avitoOrderId: string | null
): Promise<{ id: string; session_id: string; avito_chat_id: string } | null> {
  if (!avitoOrderId) return null;
  // Heuristic: avito_orders ← session_id, avito_chats ← session_id + последний.
  // Для точной связи нужен avito_order_id ↔ chat_id mapping (Open Q —
  // зависит от того, что отдаёт Avito API в order details).
  const { data: avitoOrder } = await supabase
    .from("avito_orders")
    .select("session_id, avito_item_id")
    .eq("avito_order_id", avitoOrderId)
    .maybeSingle();
  if (!avitoOrder?.session_id) return null;

  const { data: chat } = await supabase
    .from("avito_chats")
    .select("id, session_id, avito_chat_id")
    .eq("session_id", avitoOrder.session_id)
    .eq("avito_item_id", avitoOrder.avito_item_id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return chat ?? null;
}

async function loadSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionId: string
): Promise<BrowserSession | null> {
  const { data } = await supabase
    .from("avito_browser_sessions")
    .select("cookies, user_agent, proxy_url, browser_fingerprint")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  return {
    cookies: data.cookies ?? [],
    userAgent: data.user_agent ?? "Mozilla/5.0",
    proxyUrl: data.proxy_url ?? null,
    platform: (data.browser_fingerprint as { platform?: string } | null)?.platform ?? null,
  };
}

async function escalateToOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orderId: string,
  reason: string
): Promise<void> {
  await supabase
    .from("orders")
    .update({
      system_comment: `[escalation] ${reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  // TODO: DM директору/владельцу через src/lib/telegram/notifications.ts
  console.log(`[avito-request-size] escalated order ${orderId}: ${reason}`);
}

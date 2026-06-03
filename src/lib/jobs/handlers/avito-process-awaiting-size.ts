/**
 * BullMQ handler: avito-process-awaiting-size
 *
 * Периодически (каждые 2 минуты) обрабатывает заказы в статусе
 * `awaiting_size`:
 *
 *  1. Для каждого заказа подтягивает последнее входящее сообщение из
 *     Avito-чата (полученное после нашего исходящего AI-вопроса).
 *  2. Пытается распарсить размер через `size-parser.ts`.
 *  3. При успехе: атомарно ставит `product_size_id`, резервирует сток,
 *     переводит заказ в `paid`, шлёт thanks-message в чат.
 *  4. При неудаче парсинга: инкрементит miss-counter; на 2-м промахе
 *     эскалация (сейчас лог + system_comment; DM-helper — TODO).
 *  5. Таймаут: если заказ висит в `awaiting_size` дольше
 *     `business_settings.avito_size_request_timeout_hours` (12 по дефолту)
 *     или `send_by` сегодня/в прошлом — переводим в `cancelled`, эскалация.
 *
 * Полноценный AI (с торгом и обработкой возражений) — следующая
 * итерация. Это минимальная версия по ТЗ §4.4.
 */

import type { Job } from "bullmq";
import { createServiceClientLoose } from "@/lib/supabase/server";
import {
  fetchAvitoChatMessages,
  fetchAvitoOrderDetails,
  sendAvitoWebMessage,
  type BrowserSession,
} from "@/lib/avito/web-client";
import { parseAvitoSizeReply } from "@/lib/avito/size-parser";
import { sendByRoute } from "@/lib/telegram/notifications";
import { cancelAvitoOrderViaApi } from "@/lib/avito/cancel";

const MAX_MISSES_BEFORE_ESCALATE = 2;

export async function handleAvitoProcessAwaitingSize(_job: Job): Promise<void> {
  const supabase = createServiceClientLoose();

  // 1) Активные awaiting_size заказы (source='avito').
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, avito_order_id, product_id, send_by, created_at, system_comment"
    )
    .eq("source", "avito")
    .eq("status", "awaiting_size")
    .limit(100);

  if (!orders || orders.length === 0) return;

  // 2) Таймаут из business_settings.
  const { data: settings } = await supabase
    .from("business_settings")
    .select("avito_size_request_timeout_hours")
    .limit(1)
    .maybeSingle();
  const timeoutHours = (settings?.avito_size_request_timeout_hours as number | null) ?? 12;
  const timeoutMs = timeoutHours * 3600 * 1000;
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  for (const order of orders) {
    // 3) Таймаут / send_by сгорел — cancel + эскалация.
    const createdAtMs = new Date(order.created_at).getTime();
    const ageMs = now - createdAtMs;
    const sendByExpired = !!order.send_by && order.send_by < today;
    if (ageMs > timeoutMs || sendByExpired) {
      await cancelAndEscalate(
        supabase,
        order.id,
        sendByExpired ? "send_by сгорел в awaiting_size" : `Покупатель не ответил в ${timeoutHours}ч`
      );
      continue;
    }

    if (!order.product_id) continue; // объявление не привязано → AI не запускали

    // 4) Достаём чат + последнее наше AI-out сообщение.
    const chat = await findChatForAvitoOrder(supabase, order.avito_order_id);
    if (!chat) continue;

    const { data: lastAiOut } = await supabase
      .from("avito_messages")
      .select("created_at")
      .eq("chat_id", chat.id)
      .eq("direction", "out")
      .eq("is_ai_generated", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const session = await loadSession(supabase, chat.session_id);
    if (!session) continue;

    // 5) Тянем входящие после нашего AI-out.
    const incoming = await fetchIncomingAfter(
      session,
      chat.avito_chat_id,
      lastAiOut?.created_at ?? null
    );
    if (incoming.length === 0) continue;

    // Берём самое старое непрочитанное (которое идёт после нашего вопроса) —
    // обычно это и есть ответ. Игнорируем последующие до решения по нему.
    const replyText = incoming[0].text.trim();

    // 6) Какие размеры в наличии прямо сейчас?
    const { data: stockRows } = await supabase
      .from("product_sizes")
      .select("id, size, current_quantity")
      .eq("product_id", order.product_id)
      .gt("current_quantity", 0);
    const available = (stockRows ?? []).map((r: { size: string }) => r.size);

    if (available.length === 0) {
      await cancelAndEscalate(supabase, order.id, "Все размеры распроданы пока ждали ответа");
      continue;
    }

    const parsedSize = parseAvitoSizeReply(replyText, available);

    // Логируем входящее (для аудита AI-flow).
    await supabase.from("avito_messages").insert({
      chat_id: chat.id,
      direction: "in",
      content_text: replyText,
      parsed_size: parsedSize,
      created_at: new Date().toISOString(),
    });

    if (!parsedSize) {
      // Не распознали — инкрементим miss-counter в system_comment.
      const misses = parseMisses(order.system_comment) + 1;
      if (misses >= MAX_MISSES_BEFORE_ESCALATE) {
        await cancelAndEscalate(supabase, order.id, `Не распознали ответ ${misses}× подряд`);
      } else {
        await supabase
          .from("orders")
          .update({
            system_comment: `[ai-misses:${misses}] ${replyText.slice(0, 80)}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
        // Перезапрос с пояснением.
        const ask = `Подскажите размер цифрой или буквой — доступны: ${available.join(", ")}.`;
        await trySendChat(session, chat.avito_chat_id, ask);
        await logAiOut(supabase, chat.id, ask);
      }
      continue;
    }

    // 7) Размер распознан — атомарно: product_size_id + декремент стока + paid + thanks.
    // Атомарность через RPC, который должен:
    //   • проверить current_quantity > 0 для size_id
    //   • UPDATE product_sizes SET current_quantity = current_quantity - 1
    //   • UPDATE orders SET product_size_id, size, status='paid'
    //   • вернуть OK либо OUT_OF_STOCK
    const sizeRow = (stockRows ?? []).find((r: { size: string }) => r.size === parsedSize);
    if (!sizeRow) continue;

    // ТЗ §3 п.4 (стикер): перед переходом в paid убедимся, что у заказа есть
    // tracking_number / barcode_image_url. Если нет — дозагружаем детали из API
    // (Avito отдаёт barcode_url + parcelId через fetchAvitoOrderDetails).
    await ensureAvitoStikerLoaded(supabase, session, order.id, order.avito_order_id);

    const { data: rpc, error: rpcErr } = await supabase.rpc(
      "avito_confirm_size_and_reserve",
      {
        p_order_id: order.id,
        p_product_size_id: sizeRow.id,
        p_size: parsedSize,
      }
    );

    if (rpcErr || (rpc && (rpc as { ok?: boolean }).ok === false)) {
      // Размер распродался между запросом и ответом → перезапрос с обновлённым списком.
      const stillAvailable = available.filter((s) => s !== parsedSize);
      if (stillAvailable.length === 0) {
        await cancelAndEscalate(
          supabase,
          order.id,
          `Размер ${parsedSize} распродан, других нет`
        );
      } else {
        const ask = `К сожалению, ${parsedSize} только что разобрали. Остались: ${stillAvailable.join(", ")}. Какой подойдёт?`;
        await trySendChat(session, chat.avito_chat_id, ask);
        await logAiOut(supabase, chat.id, ask);
      }
      continue;
    }

    // 8) Успех — thanks-message.
    const thanks = `Спасибо, размер ${parsedSize} зафиксирован. Заказ скоро будет отправлен.`;
    await trySendChat(session, chat.avito_chat_id, thanks);
    await logAiOut(supabase, chat.id, thanks);
    console.log(`[avito-process-awaiting-size] order ${order.id}: размер ${parsedSize} → paid`);
  }
}

/** ----------- helpers ----------- */

function parseMisses(systemComment: string | null): number {
  if (!systemComment) return 0;
  const m = systemComment.match(/\[ai-misses:(\d+)\]/);
  return m ? Number(m[1]) : 0;
}

async function cancelAndEscalate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orderId: string,
  reason: string
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("order_number, avito_order_id")
    .eq("id", orderId)
    .maybeSingle();

  await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: `[avito-ai] ${reason}`,
      system_comment: `[escalation] ${reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  // Уведомить Avito-сторону (feature-flag, fire-and-forget).
  if (order?.avito_order_id) {
    void cancelAvitoOrderViaApi({
      orderId,
      avitoOrderId: order.avito_order_id,
      reason: `ai_${reason.slice(0, 60)}`,
    }).catch((e) => console.warn("[avito-process-awaiting-size] cancel API failed:", e));
  }

  // DM директору (с fallback на владельца) — routeKey order_problem.
  const orderNum = order?.order_number ? `№${order.order_number}` : "";
  const avitoId = order?.avito_order_id ? ` (Avito ${order.avito_order_id})` : "";
  await sendByRoute({
    routeKey: "order_problem",
    message:
      `⚠️ <b>Avito-заказ ${orderNum}${avitoId}</b>\n\n` +
      `Мини-AI размер не получил → отменён.\nПричина: ${reason}`,
  }).catch((e) => console.warn("[avito-process-awaiting-size] DM failed:", e));

  console.log(`[avito-process-awaiting-size] cancel+escalate ${orderId}: ${reason}`);
}

async function findChatForAvitoOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  avitoOrderId: string | null
): Promise<{ id: string; session_id: string; avito_chat_id: string } | null> {
  if (!avitoOrderId) return null;
  const { data: avitoOrder } = await supabase
    .from("avito_orders")
    .select("session_id, avito_item_id, delivery_details")
    .eq("avito_order_id", avitoOrderId)
    .maybeSingle();
  if (!avitoOrder?.session_id) return null;

  // 1) Точная связь: если в delivery_details есть channelId (например,
  // подтянуто из /api/2/profile/order через парсер), сразу ищем чат по нему.
  const channelId = (avitoOrder.delivery_details as { channelId?: string } | null)
    ?.channelId;
  if (channelId) {
    const { data: chat } = await supabase
      .from("avito_chats")
      .select("id, session_id, avito_chat_id")
      .eq("session_id", avitoOrder.session_id)
      .eq("avito_chat_id", channelId)
      .maybeSingle();
    if (chat) return chat;
  }

  // 2) Фолбэк-эвристика по последнему чату товара (если channelId не подтянут).
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
    .select("cookies, user_agent, proxy_url, browser_fingerprint, api_key")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  return {
    cookies: data.cookies ?? [],
    userAgent: data.user_agent ?? "Mozilla/5.0",
    proxyUrl: data.proxy_url ?? null,
    platform: (data.browser_fingerprint as { platform?: string } | null)?.platform ?? null,
    apiKey: data.api_key ?? null,
  };
}

async function fetchIncomingAfter(
  session: BrowserSession,
  avitoChatId: string,
  afterIso: string | null
): Promise<Array<{ text: string; createdAtIso: string }>> {
  try {
    const msgs = await fetchAvitoChatMessages(session, avitoChatId);
    const cutoffSec = afterIso ? Math.floor(new Date(afterIso).getTime() / 1000) : 0;
    return msgs
      .filter((m) => m.direction === "in")
      .filter((m) => (m.created ?? 0) > cutoffSec)
      .map((m) => ({
        text: String(m.text ?? ""),
        createdAtIso: m.created ? new Date(m.created * 1000).toISOString() : "",
      }))
      .filter((m) => m.text.length > 0)
      .sort((a, b) => (a.createdAtIso < b.createdAtIso ? -1 : 1));
  } catch (e) {
    console.warn(`[avito-process-awaiting-size] fetchMessages failed:`, (e as Error).message);
    return [];
  }
}

async function trySendChat(
  session: BrowserSession,
  avitoChatId: string,
  text: string
): Promise<void> {
  try {
    await sendAvitoWebMessage(session, avitoChatId, text);
  } catch (e) {
    console.warn(`[avito-process-awaiting-size] send failed:`, (e as Error).message);
  }
}

async function logAiOut(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  chatId: string,
  text: string
): Promise<void> {
  await supabase.from("avito_messages").insert({
    chat_id: chatId,
    direction: "out",
    content_text: text,
    is_ai_generated: true,
    created_at: new Date().toISOString(),
  });
}

/**
 * Дозагрузка Avito-стикера и tracking_number в заказ, если они ещё
 * не подтянуты sync'ом. Без них отправщик не сможет напечатать наклейку.
 */
async function ensureAvitoStikerLoaded(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  session: BrowserSession,
  orderId: string,
  avitoOrderId: string | null
): Promise<void> {
  if (!avitoOrderId) return;
  const { data: order } = await supabase
    .from("orders")
    .select("tracking_number, barcode_image_url")
    .eq("id", orderId)
    .maybeSingle();
  if (order?.tracking_number && order?.barcode_image_url) return;

  try {
    const details = await fetchAvitoOrderDetails(session, avitoOrderId);
    if (!details) return;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const barcode =
      (details as { barcodeUrl?: string }).barcodeUrl ?? null;
    const parcelId =
      (details as { parcelIdFormatted?: string }).parcelIdFormatted ??
      (details as { parcelId?: string }).parcelId ??
      null;
    if (barcode && !order?.barcode_image_url) updates.barcode_image_url = barcode;
    if (parcelId && !order?.tracking_number) updates.tracking_number = String(parcelId);
    if (Object.keys(updates).length > 1) {
      await supabase.from("orders").update(updates).eq("id", orderId);
      console.log(
        `[avito-process-awaiting-size] order ${orderId}: подтянули стикер (parcelId=${parcelId})`
      );
    }
  } catch (e) {
    console.warn(
      `[avito-process-awaiting-size] fetchAvitoOrderDetails failed for ${orderId}:`,
      (e as Error).message
    );
  }
}

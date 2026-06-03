/**
 * Отмена Avito-заказа через Avito API (ТЗ §9.2 + §15.9).
 *
 * Вызывается из shipper-actions.executeCancelOrder и
 * expire-send-by/avito-process-awaiting-size handler'ов, когда наша сторона
 * отменяет Avito-заказ (send_by сгорел / товара нет / покупатель не ответил
 * про размер). Авито должна узнать, чтобы вернуть деньги покупателю и
 * закрыть заказ на своей стороне.
 *
 * **ВАЖНО: точный endpoint в Avito API не задокументирован публично.**
 * До его подтверждения по пробе — реальный POST gate'ится feature-flag'ом
 * `AVITO_API_CANCEL_ENABLED=true` (по дефолту OFF). В выключенном
 * состоянии функция только пишет log + system_comment, чтобы оператор
 * знал, что Avito-сторону надо закрыть руками через кабинет.
 */

import { createServiceClientLoose } from "@/lib/supabase/server";
import type { BrowserSession } from "./web-client";

/** Кандидаты endpoint'ов для cancel (паттерн подтверждён HAR-снимком:
 * sellerActions.helpDeeplink = /web/1/delivery/order/{id}/help — значит
 * cancel идёт через тот же базовый путь /web/1/delivery/order/{id}/{action}). */
const CANDIDATE_ENDPOINTS = [
  "/web/1/delivery/order/{id}/cancel",
  "/web/1/delivery/order/{id}/refuse",
  "/web/1/orders/{id}/cancel",
];

export async function cancelAvitoOrderViaApi(args: {
  orderId: string;
  avitoOrderId: string;
  reason: string;
}): Promise<{ called: boolean; ok: boolean; note?: string }> {
  const supabase = createServiceClientLoose();

  if (process.env.AVITO_API_CANCEL_ENABLED !== "true") {
    // Feature-flag выключен: только пишем в system_comment + log.
    await supabase
      .from("orders")
      .update({
        system_comment:
          `[avito-cancel-pending] Авито-сторона не отменена через API ` +
          `(AVITO_API_CANCEL_ENABLED=false). Закрой заказ в кабинете Авито вручную. ` +
          `Причина: ${args.reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.orderId);
    console.log(
      `[avito-cancel] order ${args.orderId} (avito=${args.avitoOrderId}) — flag OFF, manual close required`
    );
    return { called: false, ok: false, note: "feature-flag off" };
  }

  // Достаём активную сессию для этого Avito-заказа.
  const { data: avitoOrder } = await supabase
    .from("avito_orders")
    .select("session_id")
    .eq("avito_order_id", args.avitoOrderId)
    .maybeSingle();
  if (!avitoOrder?.session_id) {
    console.warn(`[avito-cancel] no session for avito_order ${args.avitoOrderId}`);
    return { called: false, ok: false, note: "no session" };
  }

  const session = await loadSession(supabase, avitoOrder.session_id);
  if (!session) return { called: false, ok: false, note: "session load failed" };

  // Перебираем кандидаты — первый успешный считаем правильным.
  for (const tmpl of CANDIDATE_ENDPOINTS) {
    const path = tmpl.replace("{id}", encodeURIComponent(args.avitoOrderId));
    try {
      const ok = await tryCancel(session, path, args.reason);
      if (ok) {
        console.log(`[avito-cancel] success via ${tmpl} for ${args.avitoOrderId}`);
        return { called: true, ok: true, note: tmpl };
      }
    } catch (e) {
      console.warn(`[avito-cancel] ${tmpl} failed:`, (e as Error).message);
    }
  }
  return { called: true, ok: false, note: "all endpoints failed" };
}

async function tryCancel(
  session: BrowserSession,
  path: string,
  reason: string
): Promise<boolean> {
  // Не используем avitoWebFetch напрямую (он внутренний), пишем обвязку.
  const url = `https://www.avito.ru${path}`;
  const cookieHeader = session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const headers: Record<string, string> = {
    "user-agent": session.userAgent,
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    cookie: cookieHeader,
    referer: "https://www.avito.ru/profile/items/orders",
  };
  const body = JSON.stringify({ reason });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await (fetch as any)(url, {
    method: "POST",
    headers,
    body,
  });
  return res.ok === true;
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

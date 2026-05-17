export { AvitoClient } from "./client";
export { syncAvitoUser } from "./sync";
export type { SyncAvitoUserOptions, SyncAvitoResult, WebBrowserSession } from "./sync";
export type {
  AvitoResult,
  AvitoSelf,
  AvitoBalance,
  AvitoApiItem,
  AvitoItemsResponse,
  AvitoItemInfo,
  AvitoApiChat,
  AvitoChatsResponse,
  AvitoApiMessage,
  AvitoSendMessageResponse,
  AvitoWebhookPayload,
  AvitoGetItemsParams,
  AvitoGetChatsParams,
} from "./types";

import { AvitoClient } from "./client";
import { createServiceClient } from "@/lib/supabase/server";
import type { WebBrowserSession } from "./sync";

/**
 * Создать AvitoClient (OAuth) по session ID.
 * Используется API-роутами которые ещё не мигрированы на web proxy.
 */
export async function createAvitoClientForSession(sessionId: string): Promise<AvitoClient | null> {
  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("avito_browser_sessions")
    .select("avito_client_id, avito_client_secret, avito_user_id")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    console.error("[Avito] Session not found:", sessionId, error?.message);
    return null;
  }

  if (!session.avito_client_id || !session.avito_client_secret || !session.avito_user_id) {
    return null;
  }

  return new AvitoClient(
    session.avito_client_id,
    session.avito_client_secret,
    session.avito_user_id
  );
}

/**
 * Создать AvitoClient (OAuth) для пользователя.
 * Используется API-роутами которые ещё не мигрированы на web proxy.
 */
export async function createAvitoClientForUser(userId: string): Promise<AvitoClient | null> {
  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("avito_browser_sessions")
    .select("avito_client_id, avito_client_secret, avito_user_id")
    .eq("user_id", userId)
    .eq("account_index", 1)
    .single();

  if (error || !session) {
    const { data: user } = await supabase
      .from("users")
      .select("avito_client_id, avito_client_secret, avito_user_id")
      .eq("id", userId)
      .single();

    if (!user?.avito_client_id || !user?.avito_client_secret || !user?.avito_user_id) {
      return null;
    }

    return new AvitoClient(user.avito_client_id, user.avito_client_secret, user.avito_user_id);
  }

  if (!session.avito_client_id || !session.avito_client_secret || !session.avito_user_id) {
    return null;
  }

  return new AvitoClient(
    session.avito_client_id,
    session.avito_client_secret,
    session.avito_user_id
  );
}

/**
 * Получить WebBrowserSession по session ID.
 * Основной способ доступа к данным Avito — через cookies + proxy.
 */
export async function getWebSessionById(sessionId: string): Promise<WebBrowserSession | null> {
  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("avito_browser_sessions")
    .select("cookies, user_agent, proxy_url, browser_fingerprint, status")
    .eq("id", sessionId)
    .single();

  if (error || !session || session.status !== "active") {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (session.cookies as any[]) ?? [];
  if (cookies.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fp = session.browser_fingerprint as any;

  return {
    cookies,
    userAgent: session.user_agent ?? "Mozilla/5.0",
    proxyUrl: session.proxy_url ?? null,
    platform: fp?.platform ?? null,
  };
}

/**
 * Получить WebBrowserSession для пользователя (primary account).
 * Основной способ доступа к данным Avito — через cookies + proxy.
 */
export async function getWebSessionForUser(userId: string): Promise<WebBrowserSession | null> {
  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("avito_browser_sessions")
    .select("cookies, user_agent, proxy_url, browser_fingerprint, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("account_index", { ascending: true })
    .limit(1)
    .single();

  if (error || !session) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (session.cookies as any[]) ?? [];
  if (cookies.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fp = session.browser_fingerprint as any;

  return {
    cookies,
    userAgent: session.user_agent ?? "Mozilla/5.0",
    proxyUrl: session.proxy_url ?? null,
    platform: fp?.platform ?? null,
  };
}

/**
 * BullMQ handler: avito-login через HTTP (без Puppeteer).
 *
 * Flow:
 * 1. Берём credentials + proxy_url из avito_browser_sessions
 * 2. loginViaHttp → captcha solve через RuCaptcha → /web/1/auth → /web/1/tfa/request
 * 3. status='awaiting_sms' в БД, smsContext в памяти worker
 * 4. Поллим БД пока оператор не введёт sms_code
 * 5. submitSmsCode → cookies → status='active' → парсинг через worker подхватит
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptPassword, migratePasswordEncryption } from "@/lib/avito/crypto";
import { loginViaHttp, submitSmsCode, type HttpLoginResult } from "@/lib/avito/http-login";
import type { AvitoLoginJobData } from "../queues";

const SMS_POLL_INTERVAL_MS = 2_000;
const SMS_POLL_TIMEOUT_MS = 5 * 60 * 1000;

// In-memory store smsContext-ов между двумя стадиями (login → SMS submit).
// Восстанавливается с нуля при рестарте worker. В таком случае оператор
// получит ошибку и нужно будет повторить login.
const smsContextStore = new Map<string, NonNullable<HttpLoginResult["smsContext"]>>();

function ctxKey(userId: string, accountIndex: number): string {
  return `${userId}:${accountIndex}`;
}

async function pollForSmsCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  accountIndex: number
): Promise<string> {
  const startTime = Date.now();
  while (Date.now() - startTime < SMS_POLL_TIMEOUT_MS) {
    const { data } = await supabase
      .from("avito_browser_sessions")
      .select("sms_code")
      .eq("user_id", userId)
      .eq("account_index", accountIndex)
      .single();
    if (data?.sms_code) {
      return String(data.sms_code);
    }
    await new Promise((r) => setTimeout(r, SMS_POLL_INTERVAL_MS));
  }
  throw new Error("Время ожидания SMS кода истекло (5 минут). Попробуйте снова.");
}

export async function handleAvitoLogin(job: Job<AvitoLoginJobData>): Promise<void> {
  const { userId, accountIndex = 1 } = job.data;
  console.log(`[avito-login] Starting login for userId: ${userId}, account: ${accountIndex}`);

  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("avito_browser_sessions")
    .select("avito_login, avito_password_enc, proxy_url, sms_code")
    .eq("user_id", userId)
    .eq("account_index", accountIndex)
    .single();

  if (error || !session || !session.avito_login || !session.avito_password_enc) {
    console.error(`[avito-login] No session or missing credentials`, error);
    return;
  }

  let password: string;
  try {
    password = decryptPassword(session.avito_password_enc, userId);
  } catch (err) {
    console.error(`[avito-login] Decrypt password failed`, err);
    await supabase
      .from("avito_browser_sessions")
      .update({ status: "error", error_message: "Ошибка расшифровки пароля" })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);
    return;
  }

  // Lazy migration v1 → v2
  const migratedEnc = migratePasswordEncryption(session.avito_password_enc, userId);
  if (migratedEnc) {
    await supabase
      .from("avito_browser_sessions")
      .update({ avito_password_enc: migratedEnc })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);
  }

  const key = ctxKey(userId, accountIndex);

  // === ВЕТКА 1: уже awaiting_sms + есть код = submit SMS ===
  if (session.sms_code && smsContextStore.has(key)) {
    const code = String(session.sms_code).trim();
    const ctx = smsContextStore.get(key)!;
    console.log(`[avito-login] SMS code received (${code}) — submitting`);
    try {
      // очищаем код сразу чтобы не словить race
      await supabase
        .from("avito_browser_sessions")
        .update({ sms_code: null })
        .eq("user_id", userId)
        .eq("account_index", accountIndex);

      const r = await submitSmsCode(code, ctx, session.proxy_url as string);
      smsContextStore.delete(key);
      if (r.status === "success" && r.cookies) {
        await supabase
          .from("avito_browser_sessions")
          .update({
            cookies: JSON.parse(JSON.stringify(r.cookies)),
            user_agent: ctx.userAgent,
            status: "active",
            last_login_at: new Date().toISOString(),
            error_message: null,
            sms_code: null,
          })
          .eq("user_id", userId)
          .eq("account_index", accountIndex);
        console.log(`[avito-login] ✅ logged in for ${userId}/${accountIndex}, ${r.cookies.length} cookies`);
        return;
      }
      throw new Error(r.error || "SMS submit failed");
    } catch (e) {
      const msg = (e as Error).message;
      await supabase
        .from("avito_browser_sessions")
        .update({ status: "error", error_message: msg, sms_code: null })
        .eq("user_id", userId)
        .eq("account_index", accountIndex);
      throw e;
    }
  }

  // === ВЕТКА 2: новый login — ротация прокси ===
  const proxyCandidates: string[] = [];
  if (session.proxy_url) proxyCandidates.push(session.proxy_url);
  const { data: allProxies } = await supabase
    .from("avito_proxies")
    .select("proxy_url")
    .eq("is_active", true);
  for (const p of allProxies ?? []) {
    if (p.proxy_url && !proxyCandidates.includes(p.proxy_url)) {
      proxyCandidates.push(p.proxy_url);
    }
  }
  console.log(`[avito-login] proxy rotation: ${proxyCandidates.length} candidates`);

  let lastErr: string | null = null;
  for (let idx = 0; idx < proxyCandidates.length; idx++) {
    const proxyUrl = proxyCandidates[idx];
    console.log(`[avito-login] attempt ${idx + 1}/${proxyCandidates.length} via ${proxyUrl.replace(/:.+@/, ":***@")}`);
    try {
      const r = await loginViaHttp(session.avito_login as string, password, proxyUrl);

      if (r.status === "success" && r.cookies) {
        // login без SMS (бывает на trusted IP)
        await supabase
          .from("avito_browser_sessions")
          .update({
            cookies: JSON.parse(JSON.stringify(r.cookies)),
            user_agent: r.userAgent,
            proxy_url: proxyUrl,
            status: "active",
            last_login_at: new Date().toISOString(),
            error_message: null,
            sms_code: null,
          })
          .eq("user_id", userId)
          .eq("account_index", accountIndex);
        console.log(`[avito-login] ✅ logged in без SMS via ${proxyUrl.replace(/:.+@/, ":***@")}`);
        return;
      }

      if (r.status === "sms_required" && r.smsContext) {
        // Сохраняем context + переводим session в awaiting_sms + ждём sms_code
        smsContextStore.set(key, r.smsContext);
        await supabase
          .from("avito_browser_sessions")
          .update({
            proxy_url: proxyUrl,
            status: "awaiting_sms",
            error_message: null,
            sms_code: null,
          })
          .eq("user_id", userId)
          .eq("account_index", accountIndex);
        console.log(`[avito-login] SMS отправлен, ждём ввода кода из UI...`);

        // Polling БД до 5 минут
        let code: string;
        try {
          code = await pollForSmsCode(supabase, userId, accountIndex);
        } catch (pollErr) {
          smsContextStore.delete(key);
          await supabase
            .from("avito_browser_sessions")
            .update({ status: "error", error_message: "Время ожидания SMS истекло", sms_code: null })
            .eq("user_id", userId)
            .eq("account_index", accountIndex);
          throw pollErr;
        }
        // Очищаем код
        await supabase
          .from("avito_browser_sessions")
          .update({ sms_code: null })
          .eq("user_id", userId)
          .eq("account_index", accountIndex);

        // Submit
        const r2 = await submitSmsCode(code, r.smsContext, proxyUrl);
        smsContextStore.delete(key);
        if (r2.status === "success" && r2.cookies) {
          await supabase
            .from("avito_browser_sessions")
            .update({
              cookies: JSON.parse(JSON.stringify(r2.cookies)),
              user_agent: r.smsContext.userAgent,
              status: "active",
              last_login_at: new Date().toISOString(),
              error_message: null,
              sms_code: null,
            })
            .eq("user_id", userId)
            .eq("account_index", accountIndex);
          console.log(`[avito-login] ✅ logged in после SMS — ${r2.cookies.length} cookies`);
          return;
        }
        throw new Error(r2.error || "SMS submit failed");
      }

      if (r.status === "bad_creds") {
        await supabase
          .from("avito_browser_sessions")
          .update({ status: "error", error_message: "Неверный логин или пароль", sms_code: null })
          .eq("user_id", userId)
          .eq("account_index", accountIndex);
        throw new Error("Неверный логин/пароль");
      }

      // captcha_failed / blocked / error → пробуем следующий прокси
      lastErr = r.error ?? r.status;
      console.log(`[avito-login] proxy fail: ${r.status} — ${r.error}, rotating`);
    } catch (e) {
      lastErr = (e as Error).message;
      console.error(`[avito-login] attempt error:`, lastErr);
      // bad_creds — не ротируем, выходим
      if (lastErr.includes("логин") || lastErr.includes("пароль")) break;
    }
  }

  // Все прокси failed
  await supabase
    .from("avito_browser_sessions")
    .update({
      status: "error",
      error_message: lastErr ?? "Не удалось войти ни через один прокси",
      sms_code: null,
    })
    .eq("user_id", userId)
    .eq("account_index", accountIndex);
}

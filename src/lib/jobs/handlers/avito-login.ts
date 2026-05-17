/**
 * BullMQ handler: avito-login
 *
 * Логинится в Avito через Puppeteer+Stealth, сохраняет cookies в БД.
 * Поддерживает SMS-верификацию: при необходимости переводит сессию в
 * статус "awaiting_sms" и ждёт пока клиент введёт код через UI.
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptPassword, migratePasswordEncryption } from "@/lib/avito/crypto";
import type { BrowserFingerprint } from "@/lib/avito/fingerprint";
import {
  loginAndExtractCookies,
  CaptchaRequiredError,
  type OnSmsRequired,
} from "@/lib/avito/session-manager";
import type { AvitoLoginJobData } from "../queues";

const SMS_POLL_INTERVAL_MS = 2_000;
const SMS_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут

/**
 * Поллинг БД каждые 2с в ожидании SMS кода от клиента.
 * Клиент вводит код через UI → POST /api/avito/session/sms → пишется в sms_code.
 */
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
      return data.sms_code as string;
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
    .select("avito_login, avito_password_enc, proxy_url, browser_fingerprint")
    .eq("user_id", userId)
    .eq("account_index", accountIndex)
    .single();

  if (error || !session || !session.avito_login || !session.avito_password_enc) {
    console.error(
      `[avito-login] No session or missing credentials for userId: ${userId}, account: ${accountIndex}`,
      error
    );
    return;
  }

  let password: string;
  try {
    password = decryptPassword(session.avito_password_enc, userId);
  } catch (err) {
    console.error(`[avito-login] Failed to decrypt password for userId: ${userId}`, err);
    await supabase
      .from("avito_browser_sessions")
      .update({ status: "error", error_message: "Ошибка расшифровки пароля" })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);
    return;
  }

  // Lazy migration: перешифровка v1 → v2 (per-user HKDF)
  const migratedEnc = migratePasswordEncryption(session.avito_password_enc, userId);
  if (migratedEnc) {
    await supabase
      .from("avito_browser_sessions")
      .update({ avito_password_enc: migratedEnc })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);
    console.log(`[avito-login] Migrated password encryption v1→v2 for userId: ${userId}`);
  }

  // Fingerprint: используем сохранённый или генерируем новый
  const existingFingerprint = session.browser_fingerprint as BrowserFingerprint | null;

  /**
   * Колбэк SMS верификации.
   * 1. Переводим сессию в "awaiting_sms" — UI начинает показывать поле ввода
   * 2. Поллим БД пока клиент не введёт код (POST /api/avito/session/sms)
   * 3. Передаём код в Puppeteer, очищаем из БД
   */
  const onSmsRequired: OnSmsRequired = async (submitCode) => {
    console.log(
      `[avito-login] SMS required for userId: ${userId}, account: ${accountIndex} — waiting for code from UI...`
    );

    await supabase
      .from("avito_browser_sessions")
      .update({ status: "awaiting_sms", sms_code: null })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);

    let code: string;
    try {
      code = await pollForSmsCode(supabase, userId, accountIndex);
    } catch (pollErr) {
      await supabase
        .from("avito_browser_sessions")
        .update({
          status: "error",
          error_message: "Время ожидания SMS кода истекло. Попробуйте снова.",
          sms_code: null,
        })
        .eq("user_id", userId)
        .eq("account_index", accountIndex);
      throw pollErr;
    }

    // Очищаем код из БД сразу после чтения
    await supabase
      .from("avito_browser_sessions")
      .update({ sms_code: null })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);

    console.log(`[avito-login] SMS code received for userId: ${userId}, submitting to browser...`);
    await submitCode(code);
  };

  try {
    const { cookies, userAgent, fingerprint } = await loginAndExtractCookies(
      session.avito_login,
      password,
      session.proxy_url,
      onSmsRequired,
      existingFingerprint
    );

    await supabase
      .from("avito_browser_sessions")
      .update({
        cookies: JSON.parse(JSON.stringify(cookies)),
        user_agent: userAgent,
        browser_fingerprint: JSON.parse(JSON.stringify(fingerprint)),
        status: "active",
        last_login_at: new Date().toISOString(),
        error_message: null,
        sms_code: null,
      })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);

    console.log(
      `[avito-login] Successfully logged in for userId: ${userId}, account: ${accountIndex}`
    );
  } catch (err) {
    const isCaptcha = err instanceof CaptchaRequiredError;
    const errorMessage = isCaptcha
      ? "Требуется CAPTCHA — войдите в аккаунт вручную"
      : err instanceof Error
        ? err.message
        : "Неизвестная ошибка при входе";

    console.error(
      `[avito-login] Login failed for userId: ${userId}, account: ${accountIndex} —`,
      errorMessage
    );

    await supabase
      .from("avito_browser_sessions")
      .update({ status: "error", error_message: errorMessage, sms_code: null })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);
  }
}

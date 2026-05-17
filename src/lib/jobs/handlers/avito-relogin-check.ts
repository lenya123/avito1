/**
 * BullMQ handler: avito-relogin-check
 *
 * Периодически проверяет expired сессии и планирует re-login.
 *
 * Логика:
 * - Находит все сессии со статусом "expired"
 * - Пропускает сессии без пароля (не можем перелогиниться)
 * - Пропускает если last_login_at < 30 мин назад (cooldown — не долбим Avito)
 * - Обновляет Chrome версию в fingerprint (если устарела)
 * - Планирует avito-login job с задержкой (human-like stagger)
 *
 * Антидетект:
 * - Re-login'ы не мгновенные — задержка 2-10 мин после обнаружения
 * - Ночью re-login'ы откладываются до утра (7:00 МСК)
 * - Максимум 3 re-login'а за цикл (не все разом)
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { upgradeChromeVersion, type BrowserFingerprint } from "@/lib/avito/fingerprint";
import { scheduleAvitoLogin } from "../queues";
import { getMoscowTimePeriod, shuffle, humanDelay } from "@/lib/avito/human-timing";

/** Минимальный интервал между попытками re-login для одной сессии */
const RELOGIN_COOLDOWN_MS = 30 * 60 * 1000; // 30 минут

/** Максимум re-login'ов за один цикл проверки */
const MAX_RELOGINS_PER_CYCLE = 3;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleAvitoReloginCheck(_job: Job): Promise<void> {
  const period = getMoscowTimePeriod();

  // Ночью не логинимся — Avito может заметить логин в 3 часа ночи
  if (period === "night") {
    console.log("[avito-relogin-check] Night period, skipping re-login cycle");
    return;
  }

  const supabase = createServiceClient();

  // Находим expired сессии с паролем (можем перелогиниться)
  const { data: sessions, error } = await supabase
    .from("avito_browser_sessions")
    .select("id, user_id, account_index, last_login_at, browser_fingerprint, avito_password_enc")
    .eq("status", "expired")
    .not("avito_password_enc", "is", null)
    .not("avito_login", "is", null);

  if (error || !sessions?.length) {
    console.log(
      `[avito-relogin-check] No expired sessions to re-login (${error ? "error: " + error.message : "0 found"})`
    );
    return;
  }

  // Проверяем лимиты аккаунтов пользователей
  const userIds = Array.from(new Set(sessions.map((s) => s.user_id)));
  const { data: users } = await supabase
    .from("users")
    .select("id, avito_account_limit")
    .in("id", userIds);

  const userLimitMap = new Map((users || []).map((u) => [u.id, u.avito_account_limit ?? 1]));

  const now = Date.now();

  // Фильтруем: cooldown + лимит аккаунтов
  const eligible = sessions.filter((s) => {
    // Проверяем лимит аккаунтов
    const limit = userLimitMap.get(s.user_id) ?? 1;
    if (s.account_index > limit) return false;

    // Cooldown: не чаще раза в 30 мин
    if (s.last_login_at) {
      const lastLogin = new Date(s.last_login_at).getTime();
      if (now - lastLogin < RELOGIN_COOLDOWN_MS) return false;
    }

    return true;
  });

  if (eligible.length === 0) {
    console.log(
      `[avito-relogin-check] ${sessions.length} expired sessions, but all on cooldown or over limit`
    );
    return;
  }

  // Случайный порядок + лимит
  const toRelogin = shuffle(eligible).slice(0, MAX_RELOGINS_PER_CYCLE);

  console.log(
    `[avito-relogin-check] Found ${sessions.length} expired, ${eligible.length} eligible, processing ${toRelogin.length}`
  );

  for (let i = 0; i < toRelogin.length; i++) {
    const session = toRelogin[i];

    // Обновляем Chrome версию в fingerprint если устарела
    const fp = session.browser_fingerprint as BrowserFingerprint | null;
    if (fp) {
      const upgraded = upgradeChromeVersion(fp);
      if (upgraded !== fp) {
        await supabase
          .from("avito_browser_sessions")
          .update({ browser_fingerprint: JSON.parse(JSON.stringify(upgraded)) })
          .eq("id", session.id);

        console.log(
          `[avito-relogin-check] Upgraded Chrome version in fingerprint for session ${session.id}`
        );
      }
    }

    // Переводим в pending перед re-login
    await supabase
      .from("avito_browser_sessions")
      .update({ status: "pending", error_message: null })
      .eq("id", session.id);

    // Планируем login job
    await scheduleAvitoLogin(session.user_id, session.account_index);

    console.log(
      `[avito-relogin-check] Scheduled re-login for session ${session.id} ` +
        `(user ${session.user_id}, account ${session.account_index})`
    );

    // Задержка между re-login'ами (5-15с)
    if (i < toRelogin.length - 1) {
      await humanDelay(5_000, 15_000);
    }
  }

  console.log(`[avito-relogin-check] Done, scheduled ${toRelogin.length} re-login(s)`);
}

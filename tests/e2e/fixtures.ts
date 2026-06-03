import { SignJWT } from "jose";
import type { BrowserContext } from "@playwright/test";

/**
 * E2E фикстуры для авторизованных сценариев.
 *
 * Stage 1.5 закладывает каркас, но **полная имплементация — в Этапе 7**
 * (полировка панели владельца), когда появятся тест-юзеры в prod/staging.
 *
 * Проблема: owner-login идёт через Telegram Login Widget → в headless Chromium
 * напрямую не проходится. Решение — инъектировать подписанный JWT как cookie,
 * минуя UI-flow. Но для этого:
 *   - нужны тест-юзеры в prod БД (owner/shipper) с известными UUID
 *   - `SESSION_SECRET` в `.env.local` должен совпадать с тем, под которым
 *     подписывается JWT здесь
 *   - users.session_epoch должен совпадать (fail-closed validation в session.ts)
 *
 * Когда появятся тест-креды в `.env.test` (`E2E_OWNER_ID`, `E2E_SHIPPER_ID`,
 * `E2E_SESSION_SECRET`), включить loginAs* функции и написать
 * `tests/e2e/owner-smoke.spec.ts` + `shipper-smoke.spec.ts`.
 *
 * Пока (Stage 1.5) авторизованные e2e пропущены — smoke-тесты публичных
 * маршрутов и редиректов неавторизованных в `smoke.spec.ts` достаточно.
 */

export interface TestSessionConfig {
  userId: string;
  role: "owner" | "shipper" | "admin";
  sessionEpoch?: number;
  secret: string;
  expiresInSeconds?: number;
}

/** Подписывает JWT пригодный для cookie `session` — внутренняя утилита для loginAs*. */
export async function signTestSession(cfg: TestSessionConfig): Promise<string> {
  const secretKey = new TextEncoder().encode(cfg.secret);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    userId: cfg.userId,
    role: cfg.role,
    session_epoch: cfg.sessionEpoch ?? 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + (cfg.expiresInSeconds ?? 3600))
    .sign(secretKey);
}

/**
 * Ставит подписанный session-cookie в Playwright context для BASE_URL.
 * Stage 7 добавит реальные креды в `.env.test` и подключит этот helper в spec-ах.
 */
export async function seedSessionCookie(
  context: BrowserContext,
  cfg: TestSessionConfig,
  baseUrl: string
): Promise<void> {
  const token = await signTestSession(cfg);
  const url = new URL(baseUrl);
  await context.addCookies([
    {
      name: "session",
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

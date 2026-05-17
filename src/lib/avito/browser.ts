/**
 * Переиспользуемый запуск stealth-браузера под конкретную Avito-сессию.
 *
 * Антидетект на каждый магазин: восстанавливаем cookies + user-agent +
 * сохранённый browser_fingerprint + персональный прокси сессии. Тот же подход,
 * что в session-manager.loginAndExtractCookies, но БЕЗ логина — мы уже
 * залогинены через cookies. Используется item-actions (Фаза 3) и
 * posting (Фаза 4).
 */
import { createServiceClient } from "@/lib/supabase/server";
import {
  generateFingerprint,
  injectFingerprint,
  getWebRtcBlockArgs,
  type BrowserFingerprint,
} from "./fingerprint";

// Puppeteer типы намеренно any — как в session-manager.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBrowser = any;

let stealthRegistered = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureStealthRegistered(puppeteer: any): Promise<void> {
  if (stealthRegistered) return;
  const StealthPlugin = await import("puppeteer-extra-plugin-stealth");
  const stealth = StealthPlugin.default();
  puppeteer.use(stealth);
  stealthRegistered = true;
}

function parseProxyAuth(proxyUrl: string): {
  server: string;
  username?: string;
  password?: string;
} {
  try {
    const url = new URL(proxyUrl);
    const server = `${url.protocol}//${url.host}`;
    if (url.username && url.password) {
      return {
        server,
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    }
    return { server };
  } catch {
    return { server: proxyUrl };
  }
}

export function randomDelay(min: number, max: number): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

export async function humanClick(page: AnyPage, selector: string): Promise<void> {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (!box) {
    await el.click();
    return;
  }
  const x = box.x + box.width / 2 + (Math.random() - 0.5) * 6;
  const y = box.y + box.height / 2 + (Math.random() - 0.5) * 6;
  await page.mouse.move(x - 30 + Math.random() * 60, y - 20 + Math.random() * 40, { steps: 8 });
  await randomDelay(40, 120);
  await page.mouse.move(x, y, { steps: 5 });
  await randomDelay(30, 80);
  await page.mouse.click(x, y);
}

export async function humanType(page: AnyPage, selector: string, text: string): Promise<void> {
  await page.focus(selector);
  for (const char of text) {
    await page.type(selector, char, { delay: 60 + Math.random() * 80 });
    if (Math.random() < 0.05) await randomDelay(300, 700);
  }
}

/**
 * Найти и кликнуть первый существующий селектор из списка-кандидатов.
 * Возвращает true если что-то кликнули.
 */
export async function clickFirst(page: AnyPage, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    const el = await page.$(sel).catch(() => null);
    if (el) {
      await humanClick(page, sel).catch(async () => {
        await el.click().catch(() => {});
      });
      return true;
    }
  }
  return false;
}

export interface AvitoBrowserHandle {
  browser: AnyBrowser;
  page: AnyPage;
  fingerprint: BrowserFingerprint;
  close: () => Promise<void>;
}

/**
 * Открыть браузер под сессией (cookies восстановлены — мы уже залогинены).
 * @throws если сессия не active / нет cookies.
 */
export async function openAvitoSessionBrowser(
  sessionId: string,
  opts: { headless?: boolean } = {}
): Promise<AvitoBrowserHandle> {
  const supabase = createServiceClient();
  const { data: session, error } = await supabase
    .from("avito_browser_sessions")
    .select("cookies, user_agent, proxy_url, browser_fingerprint, status")
    .eq("id", sessionId)
    .single();

  if (error || !session) throw new Error("Сессия не найдена");
  if (session.status !== "active") throw new Error("Сессия неактивна — требуется вход");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (session.cookies as any[]) ?? [];
  if (cookies.length === 0) throw new Error("Нет cookies сессии");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storedFp = session.browser_fingerprint as any;
  const fp: BrowserFingerprint =
    storedFp && storedFp.userAgent ? (storedFp as BrowserFingerprint) : generateFingerprint();
  if (session.user_agent) fp.userAgent = session.user_agent;

  const puppeteer = await import("puppeteer-extra");
  await ensureStealthRegistered(puppeteer.default);

  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--lang=ru-RU,ru",
    ...getWebRtcBlockArgs(),
  ];

  let proxyAuth: { username: string; password: string } | null = null;
  if (session.proxy_url) {
    const parsed = parseProxyAuth(session.proxy_url);
    launchArgs.push(`--proxy-server=${parsed.server}`);
    if (parsed.username && parsed.password) {
      proxyAuth = { username: parsed.username, password: parsed.password };
    }
  }

  const browser = await puppeteer.default.launch({
    headless: opts.headless ?? true,
    args: launchArgs,
  });

  const close = async () => {
    await browser.close().catch(() => {});
  };

  try {
    const page = await browser.newPage();
    if (proxyAuth) await page.authenticate(proxyAuth);

    await page.setUserAgent(fp.userAgent);
    await page.setViewport(fp.viewport);
    await page.emulateTimezone("Europe/Moscow");
    await injectFingerprint(page, fp);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    // Восстанавливаем cookies — мы уже залогинены
    await page.setCookie(...cookies);

    return { browser, page, fingerprint: fp, close };
  } catch (e) {
    await close();
    throw e;
  }
}

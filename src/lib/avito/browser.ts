/**
 * Переиспользуемый запуск stealth-браузера под конкретную Avito-сессию.
 *
 * Антидетект на каждый магазин: восстанавливаем cookies + user-agent +
 * сохранённый browser_fingerprint + персональный прокси сессии. Тот же подход,
 * что в session-manager.loginAndExtractCookies, но БЕЗ логина — мы уже
 * залогинены через cookies. Используется item-actions (Фаза 3) и
 * posting (Фаза 4).
 */
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
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

/**
 * Сохранить скриншот + HTML страницы при сбое — для выверки селекторов
 * на боевом Avito (цикл правок в один заход).
 * Каталог: $AVITO_DEBUG_DIR или <tmp>/avito-debug. Никогда не бросает.
 */
export async function dumpPageDebug(
  page: AnyPage,
  label: string
): Promise<{ screenshot?: string; html?: string; url?: string }> {
  try {
    const dir = process.env.AVITO_DEBUG_DIR || join(tmpdir(), "avito-debug");
    await mkdir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const base = join(dir, `${label}-${ts}`);
    const screenshot = `${base}.png`;
    const html = `${base}.html`;
    const url: string = (() => {
      try {
        return page.url?.() ?? "";
      } catch {
        return "";
      }
    })();
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    const content = await page.content().catch(() => "");
    await writeFile(html, content).catch(() => {});
    console.error(
      `[avito-debug] ${label}: screenshot=${screenshot} html=${html} url=${url}`
    );
    return { screenshot, html, url };
  } catch (e) {
    console.error(`[avito-debug] ${label}: failed to capture`, e);
    return {};
  }
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

  // Прокси через proxy-chain (обход багов page.authenticate в новых Chromium).
  let localProxyUrl: string | null = null;
  let proxyChain: typeof import("proxy-chain") | null = null;
  if (session.proxy_url) {
    proxyChain = await import("proxy-chain");
    localProxyUrl = await proxyChain.anonymizeProxy(session.proxy_url);
    launchArgs.push(`--proxy-server=${localProxyUrl}`);
  }

  const browser = await puppeteer.default.launch({
    headless: opts.headless ?? true,
    args: launchArgs,
  });

  const close = async () => {
    await browser.close().catch(() => {});
    if (localProxyUrl && proxyChain) {
      await proxyChain.closeAnonymizedProxy(localProxyUrl, true).catch(() => {});
    }
  };

  try {
    const page = await browser.newPage();

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

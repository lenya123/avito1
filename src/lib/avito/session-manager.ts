/**
 * Менеджер браузерных сессий Avito.
 *
 * Использует puppeteer-extra + stealth plugin для имитации реального браузера.
 * Поддерживает двухшаговую верификацию (SMS), включая переключение с
 * подтверждения через приложение на SMS.
 *
 * ВАЖНО: Этот модуль работает только в Node.js окружении (worker process).
 */

import {
  type BrowserFingerprint,
  generateFingerprint,
  injectFingerprint,
  getWebRtcBlockArgs,
} from "./fingerprint";

export class CaptchaRequiredError extends Error {
  constructor() {
    super("Avito login requires CAPTCHA solving");
    this.name = "CaptchaRequiredError";
  }
}

export class SmsRequiredError extends Error {
  constructor() {
    super("Avito login requires SMS verification but no handler provided");
    this.name = "SmsRequiredError";
  }
}

export interface LoginResult {
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
  userAgent: string;
  fingerprint: BrowserFingerprint;
}

/** Функция которую вызывает обработчик чтобы передать SMS код в браузер */
export type SmsSubmitter = (code: string) => Promise<void>;

/**
 * Колбэк, вызываемый когда Avito запрашивает SMS.
 * Должен получить код (из UI/БД) и вызвать submitCode(code).
 */
export type OnSmsRequired = (submitCode: SmsSubmitter) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PuppeteerPage = any;

const LOGIN_TIMEOUT_MS = 60_000;
const NAVIGATION_TIMEOUT_MS = 60_000;
const POST_LOGIN_POLL_INTERVAL_MS = 500;
const POST_LOGIN_MAX_WAIT_MS = 20_000;

/** Stealth plugin регистрируется один раз — promise-based lock для concurrency.
 *  Через AVITO_DISABLE_STEALTH=1 можно полностью отключить (отладка прокси-auth). */
let _stealthPromise: Promise<void> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureStealthRegistered(puppeteer: any): Promise<void> {
  if (process.env.AVITO_DISABLE_STEALTH === "1") {
    console.error("[session-manager] stealth DISABLED via AVITO_DISABLE_STEALTH=1");
    return;
  }
  if (!_stealthPromise) {
    _stealthPromise = (async () => {
      const StealthPlugin = await import("puppeteer-extra-plugin-stealth");
      const stealth = StealthPlugin.default();
      stealth.enabledEvasions.delete("webgl.vendor" as never);
      stealth.enabledEvasions.delete("navigator.hardwareConcurrency" as never);
      puppeteer.use(stealth);
    })();
  }
  return _stealthPromise;
}

/** Парсит user:pass из proxy URL для page.authenticate() */

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

/**
 * Проверяет, что proxy-chain мост:
 *  1) реально слушает (TCP connect),
 *  2) форвардит на upstream (CONNECT + GET через curl).
 * Логирует подробности — для диагностики race-condition в BullMQ worker.
 */
async function selfTestBridge(localProxyUrl: string): Promise<boolean> {
  const url = new URL(localProxyUrl);
  const host = url.hostname;
  const port = parseInt(url.port);
  // 1) TCP connect — что listener вообще принимает соединения
  const tcpOk = await new Promise<boolean>((resolve) => {
    import("net").then(({ createConnection }) => {
      const sock = createConnection({ host, port, timeout: 3000 });
      sock.once("connect", () => { sock.end(); resolve(true); });
      sock.once("error", (e) => {
        console.error(`[selfTest] TCP connect ${host}:${port} fail: ${e.message}`);
        resolve(false);
      });
      sock.once("timeout", () => { sock.destroy(); resolve(false); });
    }).catch(() => resolve(false));
  });
  console.error(`[selfTest] tcp ${host}:${port} = ${tcpOk}`);
  if (!tcpOk) return false;
  // 2) Полный CONNECT через curl
  try {
    const { execFile } = await import("child_process");
    return await new Promise<boolean>((resolve) => {
      execFile(
        "curl",
        [
          "-sS", "-v", "--max-time", "10", "--proxy", localProxyUrl,
          "-o", "/dev/null", "-w", "HTTP=%{http_code}",
          "https://www.avito.ru/",
        ],
        { maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          const code = (stdout.match(/HTTP=(\d+)/) || [])[1] || "?";
          const errBrief = (stderr || "").split("\n").filter(l => l.match(/CONNECT|HTTP\/|< |error:/)).slice(0, 8).join(" | ");
          console.error(`[selfTest] curl exit=${err?.code ?? 0} code=${code} stderr: ${errBrief}`);
          resolve(!err && code === "200");
        }
      );
    });
  } catch {
    return false;
  }
}

/** Сохранить скриншот+HTML страницы для отладки (в /var/log/avito-debug или $AVITO_DEBUG_DIR). */
async function dumpDebug(page: PuppeteerPage, label: string): Promise<void> {
  try {
    const { mkdir, writeFile } = await import("fs/promises");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const dir = process.env.AVITO_DEBUG_DIR || join(tmpdir(), "avito-debug");
    await mkdir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const base = join(dir, `${label}-${ts}`);
    const shot = `${base}.png`;
    const html = `${base}.html`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const content = await page.content().catch(() => "");
    await writeFile(html, content).catch(() => {});
    console.error(
      `[session-manager] dumped: ${shot} / ${html} (url: ${page.url?.() ?? ""})`
    );
  } catch (e) {
    console.error("[session-manager] dump failed:", e);
  }
}

async function humanClick(page: PuppeteerPage, selector: string): Promise<void> {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`Cannot get bounding box: ${selector}`);

  const x = box.x + box.width / 2 + (Math.random() - 0.5) * 6;
  const y = box.y + box.height / 2 + (Math.random() - 0.5) * 6;

  await page.mouse.move(x - 30 + Math.random() * 60, y - 20 + Math.random() * 40, { steps: 8 });
  await randomDelay(40, 120);
  await page.mouse.move(x, y, { steps: 5 });
  await randomDelay(30, 80);
  await page.mouse.click(x, y);
}

async function humanType(page: PuppeteerPage, selector: string, text: string): Promise<void> {
  await page.focus(selector);
  for (const char of text) {
    await page.type(selector, char, { delay: 60 + Math.random() * 80 });
    if (Math.random() < 0.05) {
      await randomDelay(300, 700);
    }
  }
}

/**
 * Определяет состояние страницы после клика "Войти".
 * Поллинг каждые 500мс до maxWait.
 */
async function detectPostLoginState(
  page: PuppeteerPage
): Promise<"success" | "sms" | "app_confirm" | "captcha"> {
  const startTime = Date.now();

  while (Date.now() - startTime < POST_LOGIN_MAX_WAIT_MS) {
    const state = await page.evaluate((): string => {
      const url = window.location.href;
      const body = (document.body?.innerText ?? "").toLowerCase();

      // CAPTCHA
      if (
        url.includes("captcha") ||
        document.querySelector(
          '.captcha, #captcha, [data-testid="captcha"], iframe[src*="captcha"]'
        )
      ) {
        return "captcha";
      }

      // Поле ввода SMS кода
      if (
        document.querySelector('input[name="code"]') ||
        document.querySelector('input[name="smsCode"]') ||
        (document.querySelector('input[type="tel"]') && body.includes("код"))
      ) {
        return "sms";
      }

      // Экран подтверждения через приложение
      if (
        body.includes("подтвердите вход") ||
        body.includes("в приложении") ||
        body.includes("push-уведомление") ||
        body.includes("мобильном приложении")
      ) {
        return "app_confirm";
      }

      // Успешный выход с экрана логина
      if (!url.includes("#login") && !url.includes("/login") && !url.includes("authsrc=h")) {
        return "success";
      }

      return "waiting";
    });

    if (state !== "waiting") return state as "success" | "sms" | "app_confirm" | "captcha";

    await randomDelay(POST_LOGIN_POLL_INTERVAL_MS, POST_LOGIN_POLL_INTERVAL_MS + 100);
  }

  throw new Error("Timeout waiting for post-login state");
}

/**
 * Ищет кнопку "Получить SMS" / "Прислать смс" и кликает её.
 * Вызывается когда Avito показывает экран подтверждения через приложение.
 */
async function clickSendSmsButton(page: PuppeteerPage): Promise<void> {
  // Пробуем найти кнопку по тексту через evaluate
  const clicked = await page.evaluate((): boolean => {
    const keywords = ["смс", "sms", "другой способ", "другим способом", "по телефону"];
    const elements = Array.from(document.querySelectorAll("button, a, span[role='button']"));

    for (const el of elements) {
      const text = (el as HTMLElement).innerText?.toLowerCase() ?? "";
      if (keywords.some((kw) => text.includes(kw))) {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    throw new Error("Не найдена кнопка отправки SMS. Попробуйте войти вручную.");
  }

  // Ждём появления поля ввода кода
  await page.waitForSelector('input[name="code"], input[name="smsCode"], input[type="tel"]', {
    timeout: LOGIN_TIMEOUT_MS,
  });

  await randomDelay(500, 1000);
}

/**
 * Логинится в Avito через headless Chrome, возвращает cookies и userAgent.
 *
 * @param onSmsRequired — вызывается если Avito требует SMS.
 *   Получает функцию submitCode(code) для передачи кода в браузер.
 *   Если не передан и SMS потребовался — бросает SmsRequiredError.
 */
export async function loginAndExtractCookies(
  login: string,
  password: string,
  proxyUrl?: string | null,
  onSmsRequired?: OnSmsRequired,
  fingerprint?: BrowserFingerprint | null
): Promise<LoginResult> {
  const fp = fingerprint ?? generateFingerprint();

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

  // Прокси через proxy-chain: поднимаем локальный мост (127.0.0.1:rand),
  // он сам шлёт upstream с auth. Браузеру передаём адрес без креденшалов —
  // обходит баги page.authenticate в Chromium 124+/puppeteer 24.
  let localProxyUrl: string | null = null;
  let proxyChain: typeof import("proxy-chain") | null = null;
  if (proxyUrl) {
    proxyChain = await import("proxy-chain");
    localProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
    launchArgs.push(`--proxy-server=${localProxyUrl}`);
    // Self-test: убеждаемся, что мост реально форвардит на upstream
    const okBridge = await selfTestBridge(localProxyUrl);
    console.error(
      `[session-manager] proxy-chain bridge: ${localProxyUrl} → upstream (selfTest=${okBridge})`
    );
  }

  const browser = await puppeteer.default.launch({
    headless: true,
    args: launchArgs,
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(fp.userAgent);
    await page.setViewport(fp.viewport);
    await page.emulateTimezone("Europe/Moscow");
    // Временно: возможность отключить injectFingerprint для отладки
    if (process.env.AVITO_DISABLE_FP !== "1") {
      await injectFingerprint(page, fp);
    } else {
      console.error("[session-manager] injectFingerprint DISABLED via AVITO_DISABLE_FP=1");
    }
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    console.error(
      `[session-manager] UA=${fp.userAgent.slice(0, 60)}... viewport=${fp.viewport.width}x${fp.viewport.height}`
    );

    let gotoResponse;
    try {
      gotoResponse = await page.goto("https://www.avito.ru/", {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    } catch (navErr) {
      await dumpDebug(page, "avito-login-nav");
      throw navErr;
    }

    // Verbose: что реально загрузилось
    const navUrl = page.url();
    const navTitle = await page.title().catch(() => "?");
    const navLen = (await page.content().catch(() => "")).length;
    console.error(
      `[session-manager] goto OK: status=${gotoResponse?.status() ?? "?"} url=${navUrl} title="${navTitle}" htmlLen=${navLen}`
    );
    if (navLen < 50000 || !navUrl.includes("avito.ru")) {
      // что-то совсем не то загрузилось — дампим сразу
      await dumpDebug(page, "avito-login-bad-page");
      throw new Error(
        `Avito не загрузился (htmlLen=${navLen}, url=${navUrl}, title="${navTitle}")`
      );
    }

    // Ждём пока страница полностью отрисуется
    await randomDelay(2500, 5000);

    // Кликаем «Войти» в шапке — открывает модалку логина
    const headerLoginSelectors = [
      '[data-marker="header/login-button"]',
      'a[href*="login"][data-marker]',
      'button[data-marker*="login"]',
    ];
    let openedModal = false;
    for (const sel of headerLoginSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        await humanClick(page, sel).catch(() => el.click().catch(() => {}));
        openedModal = true;
        break;
      }
    }
    if (!openedModal) {
      await dumpDebug(page, "avito-login-no-header-button");
      throw new Error("Кнопка «Войти» в шапке Авито не найдена (вёрстка изменилась)");
    }
    await randomDelay(1500, 3000);

    // Вводим логин — расширенные селекторы для разных версий Авито
    const loginSelector = [
      'input[name="login"]',
      'input[data-marker="login/input"]',
      'input[type="tel"]',
      'input[type="email"]',
      'input[type="text"][autocomplete="username"]',
      'input[placeholder*="телефон"]',
      'input[placeholder*="Телефон"]',
      'input[placeholder*="почт"]',
      'input[placeholder*="логин"]',
      'input[placeholder*="email"]',
      'input[placeholder*="номер"]',
    ].join(", ");
    try {
      await page.waitForSelector(loginSelector, { timeout: LOGIN_TIMEOUT_MS });
    } catch (e) {
      await dumpDebug(page, "avito-login-selector-timeout");
      throw e;
    }
    await humanType(page, loginSelector, login);

    await randomDelay(400, 900);

    const submitSelector =
      'button[type="submit"], button[data-marker="login/submit"], button[data-marker="auth/submit"]';
    await humanClick(page, submitSelector);

    // Ждём поля пароля
    const passwordSelector =
      'input[type="password"], input[data-marker="login/password"], input[data-marker="auth/password"]';
    await page.waitForSelector(passwordSelector, { timeout: LOGIN_TIMEOUT_MS });

    await randomDelay(600, 1400);
    await humanType(page, passwordSelector, password);
    await randomDelay(300, 800);

    // Кликаем "Войти"
    await humanClick(page, submitSelector);

    // Определяем что произошло после клика
    const postLoginState = await detectPostLoginState(page);

    if (postLoginState === "captcha") {
      throw new CaptchaRequiredError();
    }

    if (postLoginState === "app_confirm" || postLoginState === "sms") {
      // Если экран подтверждения через приложение — переключаемся на SMS
      if (postLoginState === "app_confirm") {
        await clickSendSmsButton(page);
      }

      // SMS верификация требуется
      if (!onSmsRequired) {
        throw new SmsRequiredError();
      }

      // Передаём управление обработчику, который получит код из UI/БД
      await onSmsRequired(async (code: string) => {
        const smsInputSelector = 'input[name="code"], input[name="smsCode"], input[type="tel"]';
        await page.waitForSelector(smsInputSelector, { timeout: LOGIN_TIMEOUT_MS });
        await humanType(page, smsInputSelector, code);
        await randomDelay(300, 600);
        await humanClick(page, submitSelector);
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: LOGIN_TIMEOUT_MS });
      });

      // После подтверждения SMS — проверяем что всё прошло
      const afterSmsState = await detectPostLoginState(page);
      if (afterSmsState !== "success") {
        throw new Error("Не удалось войти после SMS. Проверьте код и попробуйте снова.");
      }
    }

    // Финальная проверка CAPTCHA
    const currentUrl = page.url();
    if (currentUrl.includes("#login") || currentUrl.includes("/login")) {
      throw new CaptchaRequiredError();
    }

    // Только Avito cookies — посторонние куки (analytics, trackers) = сигнал бота
    const cookies = await page.cookies("https://www.avito.ru");

    return { cookies, userAgent: fp.userAgent, fingerprint: fp };
  } finally {
    await browser.close().catch(() => {});
    if (localProxyUrl && proxyChain) {
      await proxyChain.closeAnonymizedProxy(localProxyUrl, true).catch(() => {});
    }
  }
}

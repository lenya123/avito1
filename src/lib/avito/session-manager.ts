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
  // 2) Полный CONNECT через curl, лог пишем в файл (systemd journal глотает escape-байты)
  try {
    const { execFile } = await import("child_process");
    const { writeFile } = await import("fs/promises");
    return await new Promise<boolean>((resolve) => {
      execFile(
        "curl",
        [
          "-sS", "-v", "--max-time", "10", "--proxy", localProxyUrl,
          "-o", "/dev/null", "-w", "HTTP=%{http_code}",
          "https://www.avito.ru/",
        ],
        { maxBuffer: 1024 * 1024 },
        async (err, stdout, stderr) => {
          const code = (stdout.match(/HTTP=(\d+)/) || [])[1] || "?";
          const dump = [
            `--- selfTest at ${new Date().toISOString()} ---`,
            `bridge: ${localProxyUrl}`,
            `exit: ${err?.code ?? 0}`,
            `httpCode: ${code}`,
            `--- stderr ---`,
            (stderr || "").replace(/\x1b\[[0-9;]*m/g, ""),
            `--- stdout ---`,
            stdout,
            ``,
          ].join("\n");
          await writeFile("/var/log/avito-debug/last-self-test.log", dump).catch(() => {});
          console.error(`[selfTest] curl exit=${err?.code ?? 0} code=${code} (full → /var/log/avito-debug/last-self-test.log)`);
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

      // CAPTCHA (включая hcaptcha/recaptcha/yandex-smartcaptcha)
      if (
        url.includes("captcha") ||
        document.querySelector(
          '.captcha, #captcha, [data-testid="captcha"], iframe[src*="captcha"], iframe[src*="hcaptcha"], iframe[src*="recaptcha"], iframe[src*="smartcaptcha"]'
        ) ||
        body.includes("подтвердите, что вы не робот") ||
        body.includes("докажите, что вы человек")
      ) {
        return "captcha";
      }

      // Поле ввода SMS кода (расширенные селекторы)
      if (
        document.querySelector('input[name="code"]') ||
        document.querySelector('input[name="smsCode"]') ||
        document.querySelector('input[data-marker*="sms"]') ||
        document.querySelector('input[data-marker*="code"]') ||
        document.querySelector('input[autocomplete="one-time-code"]') ||
        ((document.querySelector('input[type="tel"]') || document.querySelector('input[inputmode="numeric"]')) &&
          (body.includes("код") || body.includes("смс") || body.includes("sms")))
      ) {
        return "sms";
      }

      // Экран подтверждения через приложение / "Сработала защита профиля"
      if (
        document.querySelector('[data-marker^="auth-app/"]') ||
        document.querySelector('[data-marker="password-was-reset-form/title"]') ||
        body.includes("сработала защита профиля") ||
        body.includes("подтвердите вход") ||
        body.includes("в приложении") ||
        body.includes("push-уведомление") ||
        body.includes("мобильном приложении")
      ) {
        return "app_confirm";
      }

      // Ошибка логина/пароля
      if (
        body.includes("неверный пароль") ||
        body.includes("неправильный логин") ||
        body.includes("не удалось войти") ||
        body.includes("аккаунт не найден")
      ) {
        return "bad_creds";
      }

      // Avito бан/ограничение доступа
      if (
        body.includes("доступ закрыт") ||
        body.includes("доступ ограничен") ||
        body.includes("аккаунт заблокирован") ||
        body.includes("временно ограничен")
      ) {
        return "blocked";
      }

      // Успешный вход — ищем явные маркеры залогиненного состояния
      const loggedIn =
        document.querySelector('[data-marker="header/profile"]') ||
        document.querySelector('[data-marker="header/account"]') ||
        document.querySelector('[data-marker="header/messenger"]') ||
        document.querySelector('a[href*="/profile"][data-marker]');
      const noLoginButton = !document.querySelector('[data-marker="header/login-button"]');
      if (loggedIn || (noLoginButton && !url.includes("login"))) {
        return "success";
      }

      return "waiting";
    });

    if (state !== "waiting") {
      if (state === "bad_creds") {
        await dumpDebug(page, "avito-login-bad-creds");
        throw new Error("Avito: неверный логин/пароль");
      }
      if (state === "blocked") {
        await dumpDebug(page, "avito-login-blocked");
        throw new Error(
          "Avito заблокировал вход (Доступ закрыт). Возможные причины: прокси-IP под подозрением, аккаунт залочен после многих попыток входа, либо требуется ручной вход с этого IP/устройства."
        );
      }
      // Дампим страницу при sms/app_confirm/captcha — для диагностики что Avito реально показал
      await dumpDebug(page, `avito-login-state-${state}`);
      return state as "success" | "sms" | "app_confirm" | "captcha";
    }

    await randomDelay(POST_LOGIN_POLL_INTERVAL_MS, POST_LOGIN_POLL_INTERVAL_MS + 100);
  }

  // Не дождались — дампим страницу для диагностики
  await dumpDebug(page, "avito-login-post-timeout");
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

  // AVITO_HEADED=1 + DISPLAY=:99 (Xvfb) → реальный browser window, обходит
  // часть headless-детекций Avito. По умолчанию headless: true.
  const useHeaded = process.env.AVITO_HEADED === "1";
  if (useHeaded) {
    console.error(`[session-manager] headed mode (DISPLAY=${process.env.DISPLAY ?? "?"})`);
  }
  const browser = await puppeteer.default.launch({
    headless: useHeaded ? false : true,
    args: launchArgs,
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(fp.userAgent);
    await page.setViewport(fp.viewport);
    await page.emulateTimezone("Europe/Moscow");

    // Полифилл __name (tsx/esbuild helper) — иначе arrow-функции
    // в page.evaluate() падают с "__name is not defined".
    await page.evaluateOnNewDocument(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      if (typeof g.__name === "undefined") g.__name = (fn: unknown) => fn;
    });

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

    // Сначала прогреваем сессию визитом на главную (cookies, fingerprint в JS),
    // потом сразу идём на полноценную страницу логина — это надёжнее модалки,
    // которая иногда не загружается в облегчённом варианте главной.
    let gotoResponse;
    try {
      // domcontentloaded — networkidle2 на Avito не срабатывает (бесконечная
      // активность от analytics/ads). После goto делаем явный randomDelay
      // ниже чтобы SPA успело загрузить login-роутер.
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

    // Ранняя проверка soft-bana по IP: Avito возвращает 200 + контент,
    // но с баннером "Доступ ограничен: проблема с IP" и без интерактивных
    // частей (нет login-form). Падаем сразу с понятной ошибкой.
    const ipBlocked = await page.evaluate(() => {
      const t = document.body?.innerText ?? "";
      return /Доступ ограничен[:\s]*проблема с IP/i.test(t) ||
        /проблема с IP/i.test(t);
    });
    if (ipBlocked) {
      await dumpDebug(page, "avito-login-ip-blocked");
      throw new Error(
        "Avito заблокировал IP прокси («Доступ ограничен: проблема с IP»). Нужно сменить прокси (желательно мобильный)."
      );
    }

    // Ждём пока страница полностью отрисуется
    await randomDelay(2500, 5000);

    // ВАЖНО: /profile/login возвращает 403 для Puppeteer (anti-bot шит включён).
    // Остаёмся на главной, открываем модалку через hash-trigger.
    // Avito рандомно отдаёт degraded SPA без login-роутера → retry до 4 раз
    // с переоткрытием page (новый visit главной).
    const headerLoginSelectors = [
      '[data-marker="header/login-button"]',
      'a[href*="login"][data-marker]',
      'button[data-marker*="login"]',
    ];

    const tryOpenLoginModal = async (p: PuppeteerPage): Promise<boolean> => {
      const dismissed = await p.evaluate(() => {
        const results: string[] = [];
        const cookieBtn = document.querySelector('[data-marker^="cookie-consent/button"]') as HTMLElement | null;
        if (cookieBtn) { cookieBtn.click(); results.push("cookie-consent"); }
        const locLeave = document.querySelector('[data-marker="location/tooltip-leave-as-is"]') as HTMLElement | null;
        if (locLeave) { locLeave.click(); results.push("location-tooltip"); }
        const dialogClose = document.querySelector('[role="dialog"] [aria-label*="закры" i], [role="dialog"] [aria-label*="close" i]') as HTMLElement | null;
        if (dialogClose) { dialogClose.click(); results.push("dialog-close"); }
        return results;
      });
      if (dismissed.length > 0) {
        console.error(`[session-manager] dismissed popups: ${dismissed.join(", ")}`);
        await randomDelay(500, 1000);
      }

      const buttonExists = await p.evaluate((sels: string[]) => {
        for (const s of sels) if (document.querySelector(s)) return true;
        return false;
      }, headerLoginSelectors);
      if (!buttonExists) return false;

      // 1) history.pushState + popstate (Avito-роутер слушает popstate, а
      //    обычный hashchange может игнорироваться React-роутером).
      await p.evaluate((sels: string[]) => {
        let targetHash = "login?authsrc=h";
        for (const s of sels) {
          const el = document.querySelector(s) as HTMLAnchorElement | null;
          if (el && el.getAttribute("href")?.startsWith("#")) {
            targetHash = el.getAttribute("href")!.slice(1);
            break;
          }
        }
        try {
          history.pushState(null, "", "#" + targetHash);
          window.dispatchEvent(new PopStateEvent("popstate"));
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        } catch {
          window.location.hash = targetHash;
        }
      }, headerLoginSelectors).catch(() => {});
      // 2) dispatchEvent + click через JS
      await p.evaluate((sels: string[]) => {
        for (const s of sels) {
          const el = document.querySelector(s) as HTMLElement | null;
          if (el) {
            el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            el.click();
            break;
          }
        }
      }, headerLoginSelectors).catch(() => {});
      // 3) scrollIntoView + реальный mouse-клик (CDP-уровень)
      for (const sel of headerLoginSelectors) {
        const el = await p.$(sel).catch(() => null);
        if (el) {
          await p.evaluate((s: string) => {
            const elm = document.querySelector(s) as HTMLElement | null;
            elm?.scrollIntoView({ block: "center", inline: "center" });
          }, sel).catch(() => {});
          await randomDelay(200, 500);
          await humanClick(p, sel).catch(() => {});
          break;
        }
      }
      // ждём модалку — поллинг до 15с (Avito SPA медленный)
      try {
        await p.waitForFunction(
          () => !!document.querySelector('[data-marker^="login-form/"], [data-marker^="login/"], [data-marker^="auth-app"]'),
          { timeout: 15000 }
        );
      } catch {
        // не дождались
      }

      const state = await p.evaluate(() => ({
        hash: window.location.hash,
        inputCount: document.querySelectorAll("input").length,
        hasLoginForm: !!document.querySelector('[data-marker^="login-form/"], [data-marker^="login/"], form[action*="login"], [class*="login-form"]'),
      }));
      console.error(
        `[session-manager] post-modal-trigger: hash=${state.hash} inputs=${state.inputCount} hasLoginForm=${state.hasLoginForm}`
      );
      return state.hasLoginForm;
    };

    // Одна попытка открыть модалку. Ретраи в одной сессии делают только хуже —
    // Avito прогрессирующе банит при повторных goto, выдаёт degraded SPA или 403.
    // Если не сработало — выходим с понятной ошибкой, пусть прокси отдохнёт 5-10 мин.
    const opened = await tryOpenLoginModal(page);
    if (!opened) {
      await dumpDebug(page, "avito-login-modal-failed");
      throw new Error(
        "Не удалось открыть модалку логина: Avito отдаёт degraded SPA без login-роутера. Подождите 5-10 минут и попробуйте снова, либо смените прокси."
      );
    }
    await randomDelay(500, 1200);

    // Вводим логин — расширенные селекторы для разных версий Авито
    const loginSelector = [
      // Современный Avito
      'input[data-marker="login-form/login/input"]',
      'input[data-marker="login-form/login"]',
      'input[data-marker="login/input"]',
      // Generic
      'input[name="login"]',
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
      'button[data-marker="login-form/submit"], button[type="submit"], button[data-marker="login/submit"], button[data-marker="auth/submit"]';
    await humanClick(page, submitSelector);

    // Ждём поля пароля
    const passwordSelector =
      'input[data-marker="login-form/password/input"], input[type="password"], input[data-marker="login/password"], input[data-marker="auth/password"]';
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

    // Гибридный flow для app_confirm + sms:
    // Avito может показать одновременно push-prompt (auth-app/popup) И опцию SMS.
    // Не заставляем оператора выбирать заранее — запускаем ОБА waiters параллельно:
    //   • pushWaiter: polls страницу до success (оператор нажимает push в приложении Avito)
    //   • smsWaiter: вызывает onSmsRequired (поллит БД до sms_code от UI)
    // Что первое сработает — то выигрывает. Если SMS пришёл при открытом push UI —
    // переключаемся на SMS форму через clickSendSmsButton, потом submit.
    if (postLoginState === "app_confirm" || postLoginState === "sms") {
      if (!onSmsRequired) {
        throw new SmsRequiredError();
      }

      const HYBRID_TIMEOUT_MS = 5 * 60 * 1000;
      let completed = false;
      // string чтобы TS control-flow analysis не сузил тип в pushPromise/smsPromise
      let winner: string | null = null;

      const pushPromise = (async () => {
        const startTime = Date.now();
        while (Date.now() - startTime < HYBRID_TIMEOUT_MS) {
          if (completed) return;
          try {
            const checkState = await page.evaluate(() => {
              const url = window.location.href;
              // СТРОГИЙ blocked detector: ищем текст ТОЛЬКО внутри auth/error
              // диалогов, а не во всём body (там много шума от рекомендаций).
              const errorContainers = document.querySelectorAll(
                '[data-marker^="auth-app"], [data-marker^="login-form"], [data-marker^="password-was-reset-form"], [role="dialog"], [class*="error"]'
              );
              for (const c of Array.from(errorContainers)) {
                const t = ((c as HTMLElement).innerText ?? "").toLowerCase();
                if (
                  t.includes("доступ закрыт") ||
                  t.includes("доступ ограничен") ||
                  t.includes("временно ограничен") ||
                  t.includes("аккаунт заблокирован")
                ) return "blocked";
              }
              if (
                url.includes("captcha") ||
                document.querySelector('iframe[src*="captcha"], iframe[src*="smartcaptcha"]')
              ) return "captcha";
              const loggedIn =
                document.querySelector('[data-marker="header/profile"]') ||
                document.querySelector('[data-marker="header/account"]') ||
                document.querySelector('[data-marker="header/messenger"]');
              const noLoginForm = !document.querySelector('[data-marker^="login-form/"]');
              const noLoginBtn = !document.querySelector('[data-marker="header/login-button"]');
              const noAuthApp = !document.querySelector('[data-marker^="auth-app"]');
              if (loggedIn || (noLoginForm && noLoginBtn && noAuthApp && !url.includes("login"))) return "success";
              return "waiting";
            });
            if (checkState === "success") {
              completed = true;
              winner = "push";
              console.error("[session-manager] push-confirmation выиграл — login успешен");
              return;
            }
            if (checkState === "blocked") {
              completed = true;
              throw new Error(
                "Avito заблокировал вход во время ожидания push-подтверждения"
              );
            }
            if (checkState === "captcha") {
              completed = true;
              throw new CaptchaRequiredError();
            }
          } catch (e) {
            if (completed && winner === "sms") return; // SMS уже выиграл, тихо выходим
            throw e;
          }
          await randomDelay(2000, 3000);
        }
      })();

      const smsPromise = (async () => {
        try {
          await onSmsRequired(async (code: string) => {
            if (completed) return;
            // Если открыт push-UI (app_confirm), сначала переключаемся на SMS форму
            const hasPushUI = await page.evaluate(() => {
              return !!document.querySelector('[data-marker^="auth-app/"]') ||
                     !!document.querySelector('[data-marker="password-was-reset-form/title"]');
            });
            if (hasPushUI) {
              console.error("[session-manager] SMS получен — переключаю на SMS форму");
              await clickSendSmsButton(page).catch((e) => {
                console.error("[session-manager] clickSendSmsButton failed:", (e as Error)?.message);
              });
            }
            const smsInputSelector = 'input[name="code"], input[name="smsCode"], input[type="tel"], input[autocomplete="one-time-code"], input[inputmode="numeric"]';
            await page.waitForSelector(smsInputSelector, { timeout: LOGIN_TIMEOUT_MS });
            await humanType(page, smsInputSelector, code);
            await randomDelay(300, 600);
            await humanClick(page, submitSelector);
            await Promise.race([
              page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => null),
              page.waitForFunction(
                () => {
                  const loggedIn = document.querySelector('[data-marker="header/profile"], [data-marker="header/account"], [data-marker="header/messenger"]');
                  const noLoginForm = !document.querySelector('[data-marker^="login-form/"]');
                  const noLoginBtn = !document.querySelector('[data-marker="header/login-button"]');
                  return !!loggedIn || (noLoginForm && noLoginBtn);
                },
                { timeout: 25000 }
              ).catch(() => null),
            ]);
            await randomDelay(800, 1500);
            completed = true;
            winner = "sms";
            console.error("[session-manager] SMS-flow выиграл");
          });
        } catch (e) {
          if (completed && winner === "push") return; // push уже выиграл, OK
          throw e;
        }
      })();

      // Ждём кто первый завершится (любой error пробросится дальше)
      await Promise.race([pushPromise, smsPromise]);

      // Финальная верификация: убеждаемся что мы в success state
      const afterAuthState = await page.evaluate(() => {
        const loggedIn =
          document.querySelector('[data-marker="header/profile"]') ||
          document.querySelector('[data-marker="header/account"]') ||
          document.querySelector('[data-marker="header/messenger"]');
        const noLoginForm = !document.querySelector('[data-marker^="login-form/"]');
        const noLoginBtn = !document.querySelector('[data-marker="header/login-button"]');
        return !!loggedIn || (noLoginForm && noLoginBtn);
      });
      if (!afterAuthState) {
        throw new Error("Не удалось войти. Push не подтверждён и SMS не сработал.");
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

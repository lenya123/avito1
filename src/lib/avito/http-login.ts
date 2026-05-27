/**
 * HTTP-only login в Avito — без Puppeteer.
 *
 * Flow:
 * 1. GET https://www.avito.ru/ → собираем cookies (включая cfidsw-avito,
 *    srv_id, gMltIuegZN2COuSe — anti-bot токены)
 * 2. POST /web/1/auth (multipart) с login+password+fid+gibSessionId
 *    [+ captcha от RuCaptcha если Avito её требует]
 * 3. Если требуется SMS → POST /web/1/tfa/request {phone}
 * 4. Ждём sms_code от UI, POST /web/2/tfa/auth {code, flow:"sms", fid, gibSessionId}
 * 5. Финальные cookies сохраняем в БД
 *
 * Все запросы — через прокси, никакого браузера.
 */

import { randomBytes } from "crypto";
import { ProxyAgent } from "undici";
import { solveGeeTestV4 } from "./rucaptcha";

// Avito GeeTest v4 captcha_id. Извлечён из URL gcaptcha4.geetest.com/load?captcha_id=...
// при реальном логине через Chrome. Меняется крайне редко (только при ребрендинге GeeTest у Avito).
const AVITO_GEETEST_CAPTCHA_ID = "d583333c794a90b992c73422203c3461";

const UA_DEFAULT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36";

export interface AvitoCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number | null;
  httpOnly?: boolean;
  secure?: boolean;
}

export interface HttpLoginResult {
  status: "success" | "sms_required" | "bad_creds" | "blocked" | "captcha_failed" | "error";
  cookies?: AvitoCookie[];
  /** Для SMS continuation — нужны fid/gibSessionId/cookies + userAgent */
  smsContext?: {
    fid: string;
    gibSessionId: string;
    cookies: AvitoCookie[];
    userAgent: string;
    phone: string;
  };
  error?: string;
  userAgent?: string;
}

function cookieHeader(cookies: AvitoCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function parseSetCookie(setCookie: string | string[] | null): AvitoCookie[] {
  if (!setCookie) return [];
  const raw = Array.isArray(setCookie) ? setCookie : setCookie.split(/,(?=\s*[A-Za-z_-]+=)/);
  const cookies: AvitoCookie[] = [];
  for (const line of raw) {
    const parts = line.split(";").map((p) => p.trim());
    const first = parts[0];
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq < 0) continue;
    const name = first.slice(0, eq);
    const value = first.slice(eq + 1);
    const cookie: AvitoCookie = { name, value, domain: ".avito.ru", path: "/" };
    for (const p of parts.slice(1)) {
      const [k, v] = p.split("=");
      const kl = k.toLowerCase();
      if (kl === "domain" && v) cookie.domain = v;
      if (kl === "path" && v) cookie.path = v;
      if (kl === "httponly") cookie.httpOnly = true;
      if (kl === "secure") cookie.secure = true;
    }
    cookies.push(cookie);
  }
  return cookies;
}

/** Сливает старые и новые куки — новые перебивают по имени */
function mergeCookies(old: AvitoCookie[], fresh: AvitoCookie[]): AvitoCookie[] {
  const map = new Map<string, AvitoCookie>();
  for (const c of old) map.set(c.name, c);
  for (const c of fresh) map.set(c.name, c);
  return Array.from(map.values());
}

function genFid(): string {
  return randomBytes(10).toString("hex"); // 20-char hex
}

function normalizePhone(input: string): string {
  // "89851898029" / "+7 985 189-80-29" / "79851898029" → "79851898029"
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) return "7" + digits.slice(1);
  return digits;
}

function formatPhoneForLogin(input: string): string {
  // Avito хочет "+7 985 189-80-29"
  const d = normalizePhone(input);
  if (d.length !== 11) return input;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

const COMMON_HEADERS = (userAgent: string, cookies: AvitoCookie[]) => ({
  "accept": "application/json, text/plain, */*",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
  "origin": "https://www.avito.ru",
  "referer": "https://www.avito.ru/",
  "user-agent": userAgent,
  "x-requested-with": "XMLHttpRequest",
  "cookie": cookieHeader(cookies),
});

/**
 * Главная функция HTTP-логина.
 * Возвращает либо cookies (success), либо smsContext (нужен SMS код).
 */
export async function loginViaHttp(
  login: string,
  password: string,
  proxyUrl: string,
  userAgent: string = UA_DEFAULT
): Promise<HttpLoginResult> {
  const agent = new ProxyAgent(proxyUrl);
  let cookies: AvitoCookie[] = [];

  // 1. GET main page — собираем anti-bot cookies
  try {
    const mainRes = await fetch("https://www.avito.ru/", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: agent as any,
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
    });
    cookies = parseSetCookie(mainRes.headers.get("set-cookie"));
    if (cookies.length === 0) {
      return { status: "error", error: "Не получили cookies с главной Avito" };
    }
  } catch (e) {
    return { status: "error", error: "GET main failed: " + (e as Error).message };
  }

  // 2. Извлекаем gibSessionId (это cookie cfidsw-avito) и генерим fid
  const gibCookie = cookies.find((c) => c.name === "cfidsw-avito");
  const gibSessionId = gibCookie?.value ?? "";
  const fid = genFid();

  // 3. POST /web/1/auth — пробуем БЕЗ captcha первым
  const formattedLogin = formatPhoneForLogin(login);
  let authResult = await postAuth(agent, cookies, userAgent, formattedLogin, password, fid, gibSessionId, null);

  // Если требуется captcha — solve + retry
  if (authResult.captchaRequired) {
    try {
      const cap = await solveGeeTestV4(AVITO_GEETEST_CAPTCHA_ID, "https://www.avito.ru/");
      authResult = await postAuth(agent, cookies, userAgent, formattedLogin, password, fid, gibSessionId, cap);
    } catch (e) {
      return { status: "captcha_failed", error: "RuCaptcha: " + (e as Error).message };
    }
  }

  if (authResult.bodyRaw) {
    const ck = parseSetCookie(authResult.setCookie);
    cookies = mergeCookies(cookies, ck);
  }

  if (authResult.error === "bad_creds") return { status: "bad_creds", error: "Неверный логин/пароль" };
  if (authResult.error === "blocked") return { status: "blocked", error: "Avito заблокировал вход" };
  if (authResult.error) return { status: "error", error: authResult.error };

  // 4. Если SMS требуется — POST /web/1/tfa/request
  if (authResult.requiresSms) {
    const phone = normalizePhone(login);
    console.log("[http-login] /web/1/auth response:", authResult.bodyRaw?.slice(0, 500));
    console.log("[http-login] cookies before tfa/request:", cookies.length, cookies.map((c) => c.name).join(","));
    try {
      const tfaRes = await fetch("https://www.avito.ru/web/1/tfa/request", {
        method: "POST",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatcher: agent as any,
        headers: { ...COMMON_HEADERS(userAgent, cookies), "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const tfaSet = parseSetCookie(tfaRes.headers.get("set-cookie"));
      cookies = mergeCookies(cookies, tfaSet);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tfaData: any = await tfaRes.json().catch(() => null);
      console.log("[http-login] tfa/request status:", tfaRes.status, "body:", JSON.stringify(tfaData).slice(0, 500));
      if (tfaData?.status === "failure") {
        return { status: "error", error: "tfa/request: " + (tfaData?.result?.message ?? "failure") };
      }
    } catch (e) {
      return { status: "error", error: "tfa/request: " + (e as Error).message };
    }
    return {
      status: "sms_required",
      smsContext: { fid, gibSessionId, cookies, userAgent, phone },
    };
  }

  // 5. Login без SMS (если такое возможно) — cookies в БД
  return { status: "success", cookies, userAgent };
}

/**
 * Завершает login: оператор ввёл SMS код, шлём на /web/2/tfa/auth.
 */
export async function submitSmsCode(
  code: string,
  smsContext: NonNullable<HttpLoginResult["smsContext"]>,
  proxyUrl: string
): Promise<{ status: "success" | "bad_code" | "error"; cookies?: AvitoCookie[]; error?: string }> {
  const agent = new ProxyAgent(proxyUrl);
  let cookies = smsContext.cookies;
  try {
    const res = await fetch("https://www.avito.ru/web/2/tfa/auth", {
      method: "POST",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: agent as any,
      headers: { ...COMMON_HEADERS(smsContext.userAgent, cookies), "content-type": "application/json" },
      body: JSON.stringify({
        code,
        flow: "sms",
        fid: smsContext.fid,
        gibSessionId: smsContext.gibSessionId,
      }),
    });
    const setC = parseSetCookie(res.headers.get("set-cookie"));
    cookies = mergeCookies(cookies, setC);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json().catch(() => null);
    if (data?.success === false || data?.status === "failure") {
      const reason = data?.errors?.code ?? data?.errors?.message ?? data?.result?.message ?? "ошибка";
      if (String(reason).toLowerCase().includes("код") || String(reason).toLowerCase().includes("code")) {
        return { status: "bad_code", error: "Неверный SMS код" };
      }
      return { status: "error", error: String(reason) };
    }
    // success — есть session cookies (sessid, u и т.п.)
    const hasSessid = cookies.some((c) => c.name === "sessid");
    if (!hasSessid) return { status: "error", error: "После SMS submit нет sessid в cookies" };
    return { status: "success", cookies };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

// ─── helpers ───

interface PostAuthResult {
  setCookie: string | null;
  bodyRaw?: string;
  captchaRequired?: boolean;
  requiresSms?: boolean;
  error?: "bad_creds" | "blocked" | string;
}

async function postAuth(
  agent: ProxyAgent,
  cookies: AvitoCookie[],
  userAgent: string,
  loginFormatted: string,
  password: string,
  fid: string,
  gibSessionId: string,
  captcha: import("./rucaptcha").GeeTestV4Solution | null
): Promise<PostAuthResult> {
  const boundary = "----WebKitFormBoundary" + randomBytes(8).toString("hex");
  const parts: string[] = [];
  const push = (name: string, value: string) => {
    parts.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="${name}"`,
      "",
      value
    );
  };
  push("login", loginFormatted);
  push("password", password);
  push("remember", "true");
  if (captcha) {
    push("captchaResponse[captcha_output]", captcha.captcha_output);
    push("captchaResponse[gen_time]", captcha.gen_time);
    push("captchaResponse[lot_number]", captcha.lot_number);
    push("captchaResponse[pass_token]", captcha.pass_token);
  }
  push("fid", fid);
  push("gibSessionId", gibSessionId);
  parts.push(`--${boundary}--`, "");
  const body = parts.join("\r\n");

  try {
    const res = await fetch("https://www.avito.ru/web/1/auth", {
      method: "POST",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: agent as any,
      headers: {
        ...COMMON_HEADERS(userAgent, cookies),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const setCookie = res.headers.get("set-cookie");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json().catch(() => null);
    if (!data) return { setCookie, error: "empty response from /web/1/auth" };

    // IP-level rate limit / firewall
    if (data["too-many-requests"]) {
      return { setCookie, error: "blocked", bodyRaw: JSON.stringify(data) };
    }
    if (data.firewall || data.error === "firewall") {
      return { setCookie, error: "blocked", bodyRaw: JSON.stringify(data) };
    }

    // status="tfa-check" — Avito принял login+captcha, ждёт SMS код.
    // Это успешное прохождение auth, dальше /tfa/request → /tfa/auth.
    if (data.status === "tfa-check" || data.result?.flow === "sms" || data.result?.flow === "app") {
      return { setCookie, requiresSms: true, bodyRaw: JSON.stringify(data) };
    }

    if (data.success === false) {
      const reason = data.errors?.tryAgainReason ?? "";
      if (reason === "captcha") return { setCookie, captchaRequired: true, bodyRaw: JSON.stringify(data) };
      if (data.errors?.login || data.errors?.password) return { setCookie, error: "bad_creds" };
      return { setCookie, error: JSON.stringify(data.errors ?? data) };
    }

    // success === true — смотрим на result
    if (data.result?.requiresAdditionalAuth || data.result?.tfaRequired || data.requiresSms) {
      return { setCookie, requiresSms: true, bodyRaw: JSON.stringify(data) };
    }
    // Если success явно true и нет TFA — может быть логин без SMS
    if (data.success === true) {
      return { setCookie, requiresSms: false, bodyRaw: JSON.stringify(data) };
    }
    // По умолчанию (нет явного success/error) — считаем что SMS требуется
    return { setCookie, requiresSms: true, bodyRaw: JSON.stringify(data) };
  } catch (e) {
    return { setCookie: null, error: (e as Error).message };
  }
}

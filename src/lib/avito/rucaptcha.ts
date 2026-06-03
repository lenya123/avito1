/**
 * RuCaptcha integration — решает GeeTest v4 captcha (Avito использует именно её).
 * Документация: https://rucaptcha.com/api-docs (createTask + getTaskResult).
 *
 * Avito captcha_id для GeeTest v4 берётся динамически из ответа Avito или
 * можно захардкодить (мониторить если поменяется).
 */

const API_BASE = "https://api.rucaptcha.com";

export interface GeeTestV4Solution {
  captcha_output: string;
  gen_time: string;
  lot_number: string;
  pass_token: string;
}

export class RuCaptchaError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "RuCaptchaError";
  }
}

function getKey(): string {
  const key = process.env.RUCAPTCHA_API_KEY;
  if (!key) throw new RuCaptchaError("RUCAPTCHA_API_KEY не задан в env");
  return key;
}

export async function getBalance(): Promise<number> {
  const res = await fetch(`${API_BASE}/getBalance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientKey: getKey() }),
  });
  const data = (await res.json()) as { errorId: number; balance?: number };
  if (data.errorId !== 0) throw new RuCaptchaError("getBalance failed", String(data.errorId));
  return data.balance ?? 0;
}

/**
 * Создать задачу на решение GeeTest v4.
 * @param captchaId Публичный captchaId сайта (для Avito — захардкоженный)
 * @param pageUrl URL страницы где капча (https://www.avito.ru/)
 */
async function createGeeTestV4Task(captchaId: string, pageUrl: string): Promise<string> {
  // Формат для GeeTest v4 (rucaptcha.com / 2captcha.com)
  // Документация: https://2captcha.com/api-docs/geetest-v4
  const res = await fetch(`${API_BASE}/createTask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientKey: getKey(),
      task: {
        type: "GeeTestTaskProxyless",
        websiteURL: pageUrl,
        gt: captchaId,
        version: 4,
        initParameters: {
          captcha_id: captchaId,
        },
      },
    }),
  });
  const data = (await res.json()) as { errorId: number; taskId?: number; errorDescription?: string };
  if (data.errorId !== 0 || !data.taskId) {
    throw new RuCaptchaError(`createTask failed: ${data.errorDescription || data.errorId}`);
  }
  return String(data.taskId);
}

async function getTaskResult(taskId: string): Promise<GeeTestV4Solution> {
  const TIMEOUT_MS = 120_000;
  const POLL_INTERVAL_MS = 5_000;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${API_BASE}/getTaskResult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientKey: getKey(), taskId: Number(taskId) }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data.errorId !== 0) {
      throw new RuCaptchaError(`getTaskResult failed: ${data.errorDescription || data.errorId}`);
    }
    if (data.status === "ready") {
      const sol = data.solution;
      return {
        captcha_output: sol.captcha_output,
        gen_time: String(sol.gen_time),
        lot_number: sol.lot_number,
        pass_token: sol.pass_token,
      };
    }
    // status === "processing" — продолжаем poll
  }
  throw new RuCaptchaError("getTaskResult timeout 120s");
}

export async function solveGeeTestV4(captchaId: string, pageUrl: string): Promise<GeeTestV4Solution> {
  const taskId = await createGeeTestV4Task(captchaId, pageUrl);
  return await getTaskResult(taskId);
}

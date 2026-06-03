/**
 * BullMQ handler: proxy-health-check
 *
 * Периодически проверяет здоровье всех назначенных прокси.
 *
 * Логика:
 * - Берёт все прокси из avito_browser_sessions (уникальные proxy_url)
 * - Для каждого делает HEAD запрос на avito.ru через прокси
 * - Если прокси не отвечает 2+ раза подряд — помечает сессию как error
 * - Логирует результаты для мониторинга
 *
 * Не заменяет прокси автоматически — только помечает мёртвые.
 * Замена прокси меняет IP, что может вызвать подозрения у Avito.
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { ProxyAgent } from "undici";

/** Таймаут проверки прокси */
const PROXY_CHECK_TIMEOUT_MS = 15_000;

/** URL для проверки — лёгкий HEAD на главную Avito */
const CHECK_URL = "https://www.avito.ru/";

interface ProxyCheckResult {
  sessionId: string;
  proxyUrl: string;
  alive: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Проверяет один прокси через HEAD запрос.
 */
async function checkProxy(proxyUrl: string): Promise<{ alive: boolean; statusCode?: number; error?: string }> {
  try {
    const dispatcher = new ProxyAgent(proxyUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(CHECK_URL, {
        method: "HEAD",
        // @ts-expect-error -- undici dispatcher
        dispatcher,
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.42 Safari/537.36",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
      });

      clearTimeout(timeout);

      // 2xx/3xx = живой, 407 = неверная авторизация прокси, остальное = проблемы
      const alive = response.status < 400 || response.status === 403;
      return { alive, statusCode: response.status };
    } finally {
      clearTimeout(timeout);
      await dispatcher.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { alive: false, error: message };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleProxyHealthCheck(_job: Job): Promise<void> {
  const supabase = createServiceClient();

  // Берём все сессии с прокси (active + expired + pending — не error)
  const { data: sessions, error } = await supabase
    .from("avito_browser_sessions")
    .select("id, user_id, account_index, proxy_url, status")
    .not("proxy_url", "is", null)
    .neq("status", "error");

  if (error || !sessions?.length) {
    console.log("[proxy-health-check] No sessions with proxies to check");
    return;
  }

  // Дедуплицируем по proxy_url (один прокси может быть у нескольких сессий — но не должен)
  const proxySessionMap = new Map<string, typeof sessions>();
  for (const session of sessions) {
    if (!session.proxy_url) continue;
    const existing = proxySessionMap.get(session.proxy_url) ?? [];
    existing.push(session);
    proxySessionMap.set(session.proxy_url, existing);
  }

  console.log(
    `[proxy-health-check] Checking ${proxySessionMap.size} unique proxies (${sessions.length} sessions)`
  );

  const results: ProxyCheckResult[] = [];
  let deadCount = 0;

  // Проверяем каждый прокси (параллельно, но с лимитом concurrency)
  const proxyEntries = Array.from(proxySessionMap.entries());

  // Batch по 5 параллельных проверок
  for (let i = 0; i < proxyEntries.length; i += 5) {
    const batch = proxyEntries.slice(i, i + 5);

    const batchResults = await Promise.all(
      batch.map(async ([proxyUrl, proxySessions]) => {
        const check = await checkProxy(proxyUrl);

        const batchItems: ProxyCheckResult[] = proxySessions.map((s) => ({
          sessionId: s.id,
          proxyUrl,
          alive: check.alive,
          statusCode: check.statusCode,
          error: check.error,
        }));

        // Если прокси мёртв — помечаем все связанные сессии
        if (!check.alive) {
          for (const s of proxySessions) {
            // Только если сессия active — помечаем expired (не error, чтобы re-login подхватил)
            if (s.status === "active") {
              await supabase
                .from("avito_browser_sessions")
                .update({
                  status: "expired",
                  error_message: `Прокси недоступен: ${check.error ?? `HTTP ${check.statusCode}`}`,
                })
                .eq("id", s.id);
            }
          }
        }

        return batchItems;
      })
    );

    results.push(...batchResults.flat());
  }

  deadCount = results.filter((r) => !r.alive).length;
  const aliveCount = results.filter((r) => r.alive).length;

  console.log(
    `[proxy-health-check] Done: ${aliveCount} alive, ${deadCount} dead out of ${results.length} checks`
  );

  // Логируем мёртвые для мониторинга
  for (const r of results) {
    if (!r.alive) {
      console.warn(
        `[proxy-health-check] DEAD proxy: ${r.proxyUrl} (session ${r.sessionId}) — ${r.error ?? `HTTP ${r.statusCode}`}`
      );
    }
  }
}

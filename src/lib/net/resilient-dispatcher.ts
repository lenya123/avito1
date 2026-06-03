/**
 * Глобальный устойчивый undici-dispatcher для всех fetch в процессе.
 *
 * Зачем: на нестабильной/медленной сети дефолтный connect-таймаут undici (10с) рубит
 * ЖИВЫЕ-но-медленные соединения к api.telegram.org / *.supabase.co / Gemini —
 * `ConnectTimeoutError (UND_ERR_CONNECT_TIMEOUT)`. Следствие: getUpdates бота не долетает
 * (клики «Четко/Переделай» теряются), записи одобрения в Supabase падают, Gemini-запрос
 * отваливается («пришло N из 5»). Поднимаем таймауты — медленное соединение успевает встать,
 * а не убивается на 10-й секунде.
 *
 * Применяется ко ВСЕМ fetch процесса (supabase-js, grammY, Gemini) — поэтому импортируется
 * ПЕРВЫМ в точках входа worker / bots / web (instrumentation).
 */
import { setGlobalDispatcher, Agent } from "undici";

const g = globalThis as unknown as { __resilientNetInstalled?: boolean };

if (!g.__resilientNetInstalled) {
  g.__resilientNetInstalled = true;
  try {
    setGlobalDispatcher(
      new Agent({
        connect: { timeout: 30_000 }, // установка TCP/TLS: 10с → 30с
        headersTimeout: 60_000, // ждать заголовки ответа дольше (медленный апстрим)
        bodyTimeout: 120_000, // и тело — Gemini отдаёт большие картинки
      })
    );
    console.log(
      "[net] resilient undici dispatcher installed (connect=30s, headers=60s, body=120s)"
    );
  } catch (e) {
    console.error("[net] failed to install resilient dispatcher:", e);
  }
}

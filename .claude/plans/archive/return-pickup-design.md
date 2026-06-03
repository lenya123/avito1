# Механика возвратов: справедливое определение вины

## Контекст

Сейчас в проекте возвраты после 14 дней на ПВЗ автоматически уходят в `trash`, потом в `disposed` через 30 дней — без какого-либо учёта вины. Деньги клиенту никогда не возвращаются после `trash`. Это несправедливо в двух сценариях:

1. **Отправщик не делал попыток забрать возврат** — клиент не виноват, но теряет деньги
2. **Клиент сообщил о возврате слишком поздно** (для служб без API-отслеживания) — у нас физически не было времени забрать, но мы наказываем клиента

Также сейчас нет механизма "пробудить" клиента, чтобы он обновил код возврата перед заходом отправщика на ПВЗ.

**Цель**: построить систему, которая объективно определяет вину при попадании заказа в `trash`, исходя из количества реальных попыток забора отправщиком и доступного для забора времени.

## Решения, согласованные с пользователем

| Решение                    | Значение                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Статус `disposed`          | Удаляется. `trash` становится терминальным, без таймера выхода                                                     |
| Действия в trash           | На странице заказа у обеих сторон — кнопка «Написать в Telegram»                                                   |
| Trumpet-кнопка             | 1 нажатие/день на весь магазин (любой отправщик селлера). Создаёт записи попыток для всех `return_arrived` заказов |
| Физический забор           | Не создаёт новую попытку, а заполняет результат на существующей записи trumpet за сегодня                          |
| Кнопки результата          | «Забран», «Неверный код», «Неверный трек», «Нет на ПВЗ»                                                            |
| Окно уведомлений           | 10:00–22:00 МСК того же дня, что нажат trumpet                                                                     |
| Интервал                   | Каждые 30 минут до тех пор, пока клиент не обновит код                                                             |
| Отмена trumpet             | Удаляет записи попыток, рассылает «ложная тревога», ничего не засчитывается                                        |
| Депозит при вине платформы | Возвращается дропперу автоматически при переходе в trash                                                           |
| Конфигурация               | Хардкод констант `/src/lib/constants/returns.ts` (v1, легко выносится в settings позже)                            |

## Адаптивные пороги попыток

| Доступно дней (из 14) | Требуется попыток | Если меньше →                      |
| --------------------- | ----------------- | ---------------------------------- |
| 9–14                  | 3                 | Вина платформы                     |
| 6–8                   | 2                 | Вина платформы                     |
| 3–5                   | 1                 | Вина платформы                     |
| 0–2                   | 0                 | Авто-вина клиента (поздно сообщил) |

**Алгоритм определения вины (срабатывает при переходе в `trash`):**

1. Если `return_window_days <= 2` → `fault_party = 'client'`, `fault_reason = 'late_report'`. Конец.
2. Посчитать `attempts_count` из `return_pickup_attempts` для этого заказа.
3. Если `attempts_count < required_attempts` → `fault_party = 'platform'`, `fault_reason = 'no_attempts'`. Депозит возвращается клиенту. Конец.
4. Иначе (`attempts_count >= required_attempts`) → `fault_party = 'client'`. Депозит остаётся у селлера. `fault_reason`:
   - если хоть одна попытка имеет `result IN ('wrong_code','wrong_tracking','not_found')` → `'wrong_data'`
   - иначе (все попытки `result IS NULL` — отправщик жал trumpet но не доходил физически) → `'no_response'`

**Известное упрощение v1:** если `attempts_count < required_attempts`, но все совершённые попытки имели `wrong_code`/`wrong_tracking` (например, 2 попытки из 3 — обе «неверный код»), правило сейчас даёт `fault_party = 'platform'`. Это намеренно: пока следуем строгой формулировке пользователя «меньше 3 попыток = вина селлера». Если в будущем это окажется несправедливым — можно добавить shortcut «хоть одна client_blocked попытка ⇒ client fault», изменив одну ветку в коде.

## Расчёт `return_window_days`

`return_window_days` (поле в БД) — сколько дней у платформы есть на забор. Максимум 14, но может быть меньше если клиент сообщил о возврате поздно.

**Для служб с API-отслеживанием** (`cdek`, `pochta`, `5post`):

- Таймер стартует в момент API-события «возврат прибыл на ПВЗ отправителя»
- `return_window_days = 14` всегда

**Для служб без API** (`yandex`, `avito` и manual):

- Клиент сам ставит/обновляет `expected_return_date`
- Если `expected_return_date >= today` → ждём, переход в `return_arrived` на эту дату, `return_window_days = 14`
- Если `expected_return_date < today` → переход немедленно, `return_window_days = max(0, 14 - (today - expected_return_date))`
- Поле `return_window_days` фиксируется в момент перехода в `return_arrived` и больше не пересчитывается, даже если клиент потом меняет `expected_return_date`

## Архитектура

### 1. Изменения в БД (миграция `20260221000001_return_pickup_mechanics.sql`)

**Удаление статуса `disposed`:**

```sql
UPDATE orders SET status = 'trash' WHERE status = 'disposed';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('awaiting_shipment','collecting','in_transit','completed',
             'return_in_transit','return_arrived','return_completed',
             'cancelled','problem','trash')
);
```

Поле `disposed_at` оставляем в таблице (исторические данные).

**Новые поля на `orders`:**

```sql
ALTER TABLE orders
  ADD COLUMN return_window_days INT,        -- зафиксировано при return_arrived
  ADD COLUMN fault_party TEXT,              -- 'client' | 'platform' | NULL
  ADD COLUMN fault_reason TEXT;             -- 'late_report' | 'no_attempts' | 'wrong_data' | 'no_response' | NULL

-- Опционально CHECK для согласованности:
ALTER TABLE orders ADD CONSTRAINT orders_fault_reason_check CHECK (
  fault_reason IS NULL OR fault_reason IN ('late_report','no_attempts','wrong_data','no_response')
);
ALTER TABLE orders ADD CONSTRAINT orders_fault_party_check CHECK (
  fault_party IS NULL OR fault_party IN ('client','platform')
);
```

**Маппинг fault_reason:**

| reason        | party    | Описание                                                                  |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `late_report` | client   | `return_window_days <= 2` — клиент сообщил поздно                         |
| `no_attempts` | platform | Попыток меньше требуемого (меньше 3/2/1 в зависимости от окна)            |
| `wrong_data`  | client   | Попыток достаточно, и хоть одна имела результат wrong_code/tracking/found |
| `no_response` | client   | Попыток достаточно, но физических визитов не было (только trumpet)        |

**Новая таблица `return_pickup_attempts`:**

```sql
CREATE TABLE return_pickup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipper_id UUID NOT NULL REFERENCES users(id),
  trumpet_session_id UUID,                  -- ссылка на trumpet_sessions
  attempt_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  result TEXT,                              -- NULL | 'success' | 'wrong_code' | 'wrong_tracking' | 'not_found'
  result_set_at TIMESTAMPTZ,
  UNIQUE(order_id, attempt_date)
);
CREATE INDEX idx_pickup_attempts_order ON return_pickup_attempts(order_id);
CREATE INDEX idx_pickup_attempts_shipper_date ON return_pickup_attempts(shipper_id, attempt_date);
```

**Новая таблица `trumpet_sessions`:**

> **Заметка:** проект сейчас single-tenant (один селлер на всю инсталляцию, см. `settings` через `.single()` в [src/app/api/owner/dashboard/route.ts:153](src/app/api/owner/dashboard/route.ts#L153)). Поэтому `owner_id` пока резервное поле для future-proofing — фактически он всегда один и тот же. Но всё равно сохраняем его для согласованности и возможной мульти-тенант миграции в будущем.

```sql
CREATE TABLE trumpet_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID NOT NULL REFERENCES users(id),  -- кто нажал
  owner_id UUID REFERENCES users(id),             -- селлер (для future multi-tenant)
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,                -- сегодня 22:00 МСК
  cancelled_at TIMESTAMPTZ,
  bullmq_job_id TEXT
);
-- Один trumpet в день на ВЕСЬ магазин. В single-tenant — один на систему.
CREATE UNIQUE INDEX idx_trumpet_one_per_day
  ON trumpet_sessions(((started_at AT TIME ZONE 'Europe/Moscow')::date))
  WHERE cancelled_at IS NULL;
```

### 2. Константы — `/src/lib/constants/returns.ts` (новый файл)

```ts
export const RETURN_WINDOW_DAYS = 14;

export const PICKUP_THRESHOLDS = [
  { minDays: 9, maxDays: 14, requiredAttempts: 3 },
  { minDays: 6, maxDays: 8, requiredAttempts: 2 },
  { minDays: 3, maxDays: 5, requiredAttempts: 1 },
  { minDays: 0, maxDays: 2, requiredAttempts: 0 }, // авто-вина клиента
] as const;

export const TRUMPET_NOTIFICATION_INTERVAL_MIN = 30;
export const TRUMPET_WINDOW_START_HOUR = 10;
export const TRUMPET_WINDOW_END_HOUR = 22;

export function getRequiredAttempts(availableDays: number): number {
  const tier = PICKUP_THRESHOLDS.find(
    (t) => availableDays >= t.minDays && availableDays <= t.maxDays,
  );
  return tier?.requiredAttempts ?? 3;
}
```

### 3. Удаление `disposed`

**Файлы:**

- [src/lib/orders/transitions.ts](src/lib/orders/transitions.ts) — убрать `disposed` из VALID_STATUSES, убрать переход `trash → disposed`. Сделать `trash` терминальным (массив переходов = `[]`)
- [src/lib/constants/order-status.ts](src/lib/constants/order-status.ts) — убрать запись `disposed`
- [src/lib/jobs/queues.ts](src/lib/jobs/queues.ts) — удалить `scheduleDisposeTrash`, `cancelDisposeTrash`
- [src/lib/jobs/handlers/dispose-trash.ts](src/lib/jobs/handlers/dispose-trash.ts) — **удалить файл**
- [src/lib/jobs/handlers/move-to-trash.ts](src/lib/jobs/handlers/move-to-trash.ts) — убрать вызов `scheduleDisposeTrash`, добавить логику определения вины (см. ниже)
- [src/lib/jobs/worker.ts](src/lib/jobs/worker.ts) — убрать регистрацию `dispose-trash` хендлера, добавить регистрацию `trumpet-notify`
- Все API/queries/dashboard, фильтрующие по `disposed` — заменить на отсутствие фильтра (его больше нет в таблице)
- Снести pending BullMQ задачи `dispose-trash`. **Создать одноразовый скрипт** `scripts/cleanup-dispose-trash-jobs.ts`:
  ```ts
  import { getAutomationQueue } from "@/lib/jobs/queues";
  const queue = getAutomationQueue();
  const jobs = await queue.getJobs(["delayed", "waiting"]);
  for (const job of jobs) {
    if (job.name === "dispose-trash") {
      await job.remove();
      console.log(`Removed dispose-trash job ${job.id}`);
    }
  }
  ```
  Запустить один раз после деплоя: `npx tsx scripts/cleanup-dispose-trash-jobs.ts`

### 4. Логика определения вины — расширение `move-to-trash.ts`

Текущий хендлер просто переводит `return_arrived → trash`. Расширяем:

```ts
async function determineFault(orderId: string): Promise<{
  fault: "client" | "platform";
  reason: string;
}> {
  const { data: order } = await supabase
    .from("orders")
    .select("return_window_days, client_id, client_price")
    .eq("id", orderId)
    .single();

  const availableDays = order.return_window_days ?? RETURN_WINDOW_DAYS;
  const required = getRequiredAttempts(availableDays);

  // Авто-вина клиента: слишком поздно сообщил
  if (availableDays <= 2) {
    return { fault: "client", reason: "late_report" };
  }

  const { data: attempts } = await supabase
    .from("return_pickup_attempts")
    .select("result")
    .eq("order_id", orderId);

  const attemptsCount = attempts?.length ?? 0;
  const hasClientFaultResult = attempts?.some((a) =>
    ["wrong_code", "wrong_tracking", "not_found"].includes(a.result ?? ""),
  );

  if (attemptsCount >= required) {
    return {
      fault: "client",
      reason: hasClientFaultResult ? "wrong_data" : "no_response",
    };
  }
  return { fault: "platform", reason: "no_attempts" };
}
```

**Возврат депозита при вине платформы:**
Извлечь логику возврата депозита из существующей функции `executeCompleteReturn` ([src/lib/orders/shipper-actions.ts](src/lib/orders/shipper-actions.ts:375)) в отдельную утилиту `refundClientDeposit(supabase, clientId, amount)` и использовать её и в `executeCompleteReturn`, и в новой ветке `move-to-trash` (DRY).

**Запись на заказ при move-to-trash:**

```ts
await supabase
  .from("orders")
  .update({
    status: "trash",
    fault_party: fault, // 'client' | 'platform'
    fault_reason: reason,
    trash_at: new Date().toISOString(),
    status_history: appendStatusHistory(order.status_history, "trash"),
  })
  .eq("id", orderId);
```

Не забыть **убрать** вызов `scheduleDisposeTrash` (его больше нет).

### 5. Trumpet-сессия

**API: `POST /api/shipper/returns/trumpet`**

- Проверить, что есть хотя бы один заказ в статусе `return_arrived`. Если нет — вернуть `400 { error: "Нет заказов на возврате — нечего трубить" }`
- Проверить, что нет активной trumpet-сессии на сегодня (по UNIQUE индексу `date`). Если есть — вернуть `409 { error: "Уже протрублено сегодня", session: { shipper_name, started_at } }`
- Создать `trumpet_sessions` запись: `shipper_id = currentShipper`, `expires_at = сегодня 22:00 МСК`
- Найти все `return_arrived` заказы (NB: в single-tenant — все заказы этого статуса; в будущем multi-tenant — фильтр по owner_id)
- Создать `return_pickup_attempts` для каждого: `attempt_date = today`, `result = NULL`, `trumpet_session_id`, `shipper_id = currentShipper`
- Создать BullMQ-задачу `trumpet-notify` с `delay = max(0, 10:00 - now)`, сохранить `bullmq_job_id` в сессии
- **Поздний час:** если `now >= 22:00` — всё равно создать сессию и попытки (засчитывается как попытка дня), но НЕ создавать BullMQ-задачу. Вернуть в ответе флаг `notifications_skipped: true`, чтобы UI показал toast «Уведомления не отправлены — после 22:00. Попытка засчитана»

**API: `DELETE /api/shipper/returns/trumpet`**

- Найти активную сессию **селлера** (по `owner_id`) на сегодня
- Любой отправщик селлера может отменить (не только тот, кто запустил)
- Установить `cancelled_at = NOW()`
- Удалить связанные `return_pickup_attempts` (через `trumpet_session_id`)
- Удалить BullMQ-задачу
- Разослать клиентам Telegram-уведомление «Ложная тревога» (через `notifyReturnTrumpetCancelled`)

**API: `GET /api/shipper/returns/trumpet/today`**

- Возвращает активную сессию селлера за сегодня (если есть) — нужно для UI чтобы показывать состояние кнопки одинаково всем отправщикам магазина

**Новый BullMQ-хендлер: `trumpet-notify.ts`**
Логика репитера:

1. Загрузить активную сессию по `bullmq_job_id`. Если нет / отменена / прошло 22:00 → завершить.
2. Если сейчас < 10:00 → перепланировать на 10:00 и выйти.
3. Найти заказы из `return_pickup_attempts` для этой сессии, у которых:
   - `result IS NULL` (попытка ещё не закрыта физическим визитом)
   - `orders.status = 'return_arrived'` (re-check на случай если уже забран)
   - `orders.return_code IS NULL` ИЛИ `orders.return_code_updated_at < session.started_at` (клиент ещё не обновил код после нажатия trumpet)
4. Сгруппировать по `client_id`. Для каждого уникального клиента → отправить **одно** уведомление с перечислением всех его заказов, требующих обновления кода (а не отдельное уведомление на каждый заказ — иначе спам).
5. Перепланировать себя через `TRUMPET_NOTIFICATION_INTERVAL_MIN` минут (если ещё не 22:00).

Используется паттерн `delay` из [src/lib/jobs/queues.ts:184](src/lib/jobs/queues.ts#L184) и `sendNotification` из [src/lib/telegram/notifications.ts:85](src/lib/telegram/notifications.ts#L85).

**Новые шаблоны уведомлений в `notifications.ts`:**

- `notifyReturnCodeNeeded(clientId, orderNumber)` — «Отправщик идёт за возвратом, обновите код»
- `notifyReturnTrumpetCancelled(clientId, orderNumber)` — «Ложная тревога, обновлять не нужно»

### 6. Кнопки результата для отправщика

**Расширение [src/lib/orders/shipper-actions.ts](src/lib/orders/shipper-actions.ts):**

Новое действие `mark_pickup_attempt`:

```ts
{
  action: 'mark_pickup_attempt',
  orderId,
  result: 'success' | 'wrong_code' | 'wrong_tracking' | 'not_found'
}
```

Логика:

1. Проверить, что у заказа сегодня есть запись в `return_pickup_attempts` с `result IS NULL`. Если нет → вернуть ошибку «Сначала нажмите Протрубить возвраты»
2. Обновить запись: `result = ...`, `result_set_at = NOW()`
3. Если `result = 'success'` → вызвать существующий `executeCompleteReturn` (статус → `return_completed`, возврат депозита, отмена `move-to-trash` job)
4. Если `result != 'success'` → ничего не делаем со статусом, заказ остаётся в `return_arrived`, ждём следующего дня

**Endpoint:** существующий `PATCH /api/shipper/orders/[id]` — добавить новый `action`

### 7. Подсчёт `return_window_days` при переходе в `return_arrived`

**Обновление [src/lib/jobs/handlers/return-arrived.ts](src/lib/jobs/handlers/return-arrived.ts):**

Сейчас этот хендлер просто переводит статус и шедулит trash через 14 дней. Добавить:

- Прочитать `expected_return_date` и текущую дату
- Если `expected_return_date < today` (клиент сообщил поздно):
  - `daysBurned = today - expected_return_date`
  - `windowDays = max(0, 14 - daysBurned)`
  - Записать `return_window_days = windowDays`
  - Шедулить `move-to-trash` через `windowDays` дней (а не через 14)
- Иначе записать `return_window_days = 14`, шедулить через 14 дней

**Edge case `windowDays = 0`:** клиент сообщил >= 14 дней спустя. Шедулим `move-to-trash` с `delay = 0` (немедленно). При срабатывании сработает правило `return_window_days <= 2 → fault=client, late_report` и заказ сразу окажется в trash.

Также: при ручном переходе через `mark_return_arrived` (в shipper-actions) делать то же самое.

### 8. UI — отправщик

**[src/components/shipper/returns-tab.tsx](src/components/shipper/returns-tab.tsx):**

- Новая большая кнопка сверху: «📢 Протрубить возвраты»
- Состояние кнопки **общее на весь магазин** (одна сессия на селлера/день, а не на отправщика)
- Если активная сессия есть → показать «Протрублено в HH:MM ({имя отправщика, который запустил})», под ней «Отменить» (доступно любому отправщику магазина)
- Если уже было сегодня и не отменено → серая, неактивная, текст «Использовано на сегодня»
- Загружать состояние через `GET /api/shipper/returns/trumpet/today` (резолвит owner_id текущего отправщика и проверяет сессию для всего селлера)

**[src/components/shipper/order-card.tsx](src/components/shipper/order-card.tsx) (variant `returns`):**

Каждая карточка возврата получает дополнительный prop `todayAttempt: { id, result } | null` (loaded with the order list — добавить join в `/api/shipper/orders` query).

Возможные состояния:

| Состояние                              | UI на карточке                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Trumpet не нажат сегодня               | Серая подсказка «Нажмите 📢 «Протрубить возвраты» сверху, чтобы начать попытку забора»                                                         |
| Trumpet нажат, попытка `result = NULL` | Кнопка «Отметить результат» → открывает `BottomSheet` с 4 опциями: ✅ Забран / ❌ Неверный код / ❌ Неверный трек / ❌ Нет на ПВЗ              |
| Trumpet нажат, попытка имеет result    | Бейдж с результатом + текст «Следующая попытка завтра» (или «Забран» если success → заказ уже не должен быть в списке после `complete_return`) |

**Бейдж результата:** разные цвета:

- `success` → зелёный (но заказ должен быть `return_completed`, не должен показываться)
- `wrong_code` / `wrong_tracking` → оранжевый
- `not_found` → красный

**Bulk-режим:** существующая bottom-action-bar с «Возвраты забраны» (массовый `complete_return`) — должна теперь работать через `mark_pickup_attempt({result: 'success'})`. То есть `complete_return` action становится синонимом `mark_pickup_attempt({result: 'success'})`. Сохраняем backwards-compat: старый action продолжает работать, но внутри вызывает новую логику + создаёт attempt запись если её нет.

### 9. UI — trash для обеих сторон

**Owner: [src/app/(owner)/owner/orders/[id]/page.tsx](<src/app/(owner)/owner/orders/[id]/page.tsx>)**
**Client: [src/app/(client)/order/[productId]/page.tsx](<src/app/(client)/order/[productId]/page.tsx>)** (или соответствующая страница деталей заказа)

Если `status === 'trash'`:

- Показать badge с `fault_party`/`fault_reason` (читабельно)
- Кнопка «Написать в Telegram» — открывает `https://t.me/{username}` другой стороны
  - Owner видит → `users.telegram_username` клиента
  - Client видит → `settings.owner_telegram_username`
- Если оба знают про trash, дальше разбираются сами

### 10. KPI/dashboard и системный аудит фильтров

В предыдущей сессии был проведён аудит — нашлось **10 мест** в проекте, где KPI/прибыль считаются без правильной фильтрации статусов. Эта фича — подходящий момент закрыть все эти баги одним заходом, потому что:

1. Мы вводим новое исключение (`trash` где `fault_party = 'platform'`) — без него аудит будет неполным
2. Удаляется статус `disposed` — все упоминания нужно вычистить
3. Нужно стандартизировать **единый хелпер-фильтр**, чтобы такие баги не повторялись

**Новый хелпер: `/src/lib/orders/revenue-filter.ts` (новый файл)**

```ts
import type { Database } from "@/types/database.generated";

type Order = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  "status" | "fault_party"
>;

/**
 * Единый источник правды: какие заказы считаются в выручке/прибыли.
 * Исключаем те, где деньги были возвращены клиенту:
 * - cancelled — отменён, возврат депозита
 * - return_completed — возврат завершён, депозит возвращён
 * - trash + fault_party='platform' — попыток было меньше нормы, депозит возвращён
 *
 * Включаем (деньги остались у селлера):
 * - completed, активные статусы пайплайна
 * - trash + fault_party='client' (поздний репорт / неверные данные)
 * - trash + fault_party=NULL (legacy до миграции, на всякий случай считаем)
 */
export function isRevenueCounted(order: Order): boolean {
  if (order.status === "cancelled") return false;
  if (order.status === "return_completed") return false;
  if (order.status === "trash" && order.fault_party === "platform")
    return false;
  return true;
}

/** Для Supabase запросов: исключаем гарантированно «выпавшие» статусы. */
export const REVENUE_EXCLUDED_STATUSES = [
  "cancelled",
  "return_completed",
] as const;

/** SQL-фрагмент для PostgREST .not() фильтра. */
export const REVENUE_EXCLUDED_FILTER = "(cancelled,return_completed)";
```

Используется так:

```ts
// В Supabase запросе сначала отсеиваем дешёвые случаи (cancelled, return_completed):
const { data } = await supabase
  .from("orders")
  .select("created_at, client_price, purchase_price, status, fault_party")
  .gte("created_at", from)
  .not("status", "in", REVENUE_EXCLUDED_FILTER);

// Затем JS-фильтром убираем trash+platform (нельзя выразить в один .not):
const validOrders = (data ?? []).filter(isRevenueCounted);
```

**Файлы для исправления (10 мест из аудита + наш новый dashboard):**

| Файл                                             | Что сейчас                                                                                                                                                        | Что должно стать                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/app/api/owner/dashboard/route.ts`           | `.not status in (cancelled,return_completed)` в 3 местах                                                                                                          | Добавить `select fault_party` + `isRevenueCounted` фильтр после     |
| `src/app/api/owner/orders/route.ts:204-252`      | Нет фильтра когда `params.status === "all"`                                                                                                                       | Добавить `.not + isRevenueCounted` для `totalRevenue`/`totalProfit` |
| `src/app/api/owner/clients/route.ts:118-161`     | Нет фильтра вообще                                                                                                                                                | Добавить, перед агрегацией `revenue/cost/profit/orders`             |
| `src/app/api/owner/clients/[id]/route.ts:42-67`  | Нет фильтра                                                                                                                                                       | Добавить                                                            |
| `src/app/api/owner/products/route.ts:150-166`    | Только `status="completed"`                                                                                                                                       | Использовать `isRevenueCounted` (защита если код изменится)         |
| `src/app/api/owner/products/[id]/route.ts:41-69` | Нет фильтра                                                                                                                                                       | Добавить                                                            |
| `src/app/api/leaderboard/route.ts:41-46`         | `.not (cancelled,disposed)` — пропущены `return_completed`, `trash`+platform; `disposed` больше не существует                                                     | Заменить на `REVENUE_EXCLUDED_FILTER` + `isRevenueCounted`          |
| `src/app/api/stats/route.ts:117`                 | `excludedStatuses = [cancelled, disposed, trash]` — `disposed` не существует, и нужен `return_completed`, `trash` слишком грубо (теряем правильную часть выручки) | Заменить на `isRevenueCounted`                                      |
| `src/app/api/owner/stats/route.ts:105`           | то же что выше                                                                                                                                                    | то же                                                               |
| `src/app/api/owner/finance/route.ts:32-36`       | Whitelist `["completed","in_transit","collecting","awaiting_shipment"]` — пропущен `problem`, не учитывает trash+client                                           | Перейти на blacklist через `isRevenueCounted`                       |
| `src/app/api/export/orders/route.ts:217-277`     | `NEGATIVE_STATUSES = [cancelled, disposed, trash]`                                                                                                                | Использовать `isRevenueCounted`                                     |

**Важно про `disposed`:** во всех этих файлах нужно убрать упоминания `disposed` (статуса больше не существует после миграции). Сейчас несколько мест явно фильтруют по `disposed` — после удаления статуса эти строки станут мёртвым кодом, но не сломают логику.

**Verify для этой секции:**

1. Создать тестовые заказы со всеми вариантами: `completed`, `cancelled`, `return_completed`, `trash`+`fault_party=platform`, `trash`+`fault_party=client`
2. Зайти на dashboard, проверить, что выручка/прибыль НЕ включают первые три, но включают четвёртый
3. Зайти на финансы owner, на статистику клиента, на детали клиента — везде те же числа
4. Экспортировать отчёт — те же числа

### 11. Документация

- [docs/BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md) — обновить раздел «Возвраты»: добавить логику trumpet, попыток, вины, удалить упоминания disposed
- [docs/DATABASE.md](docs/DATABASE.md) — описать новые таблицы и поля
- `.claude/handoff.md` — обновить состояние

## Риски и допущения

| Риск / Допущение                                                                          | Митигация / Обоснование                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Существующие `return_arrived` заказы** имеют `return_window_days = NULL` после миграции | `move-to-trash.ts` использует fallback `?? RETURN_WINDOW_DAYS`. Эти заказы не сломаются, просто будут считаться с дефолтными 14 днями                           |
| **Существующие `trash` заказы** не имеют `fault_party`                                    | `isRevenueCounted` обрабатывает `fault_party = NULL` как «считается в выручке». Сохраняет статус-кво, не пересчитывает прошлое                                  |
| **Заказы в `disposed` после миграции** перейдут в `trash`                                 | Они потеряют различие «прошёл 30 дней в trash». В их `status_history` сохранится запись о disposed (исторически), но текущий статус будет trash                 |
| **Single-tenant**                                                                         | Фактически в проекте один селлер (settings через `.single()`). `owner_id` в `trumpet_sessions` пока резервное поле, UNIQUE индекс по дате (без owner_id)        |
| **Race: trumpet press concurrent**                                                        | UNIQUE индекс на `(date)` обеспечивает атомарность на уровне БД. Второй POST получит конфликт и вернёт 409                                                      |
| **Race: order moved to return_completed между сканом и отправкой**                        | В `trumpet-notify.ts` шаг 3 проверяет `orders.status = 'return_arrived'` непосредственно перед формированием уведомлений                                        |
| **Клиент без `telegram_id`**                                                              | `sendNotification` уже умеет это обрабатывать (пропускает, логирует). Попытка всё равно засчитывается                                                           |
| **Клиент без `telegram_username`** (для кнопки «Написать в Telegram» в trash)             | UI показывает кнопку disabled с подсказкой «У клиента не привязан Telegram username». Owner может связаться через `telegram_id` ботом — отдельный путь, future  |
| **BullMQ воркер не запущен**                                                              | Trumpet-уведомления не пойдут, попытка всё равно зарегистрирована. Это известное ограничение проекта, не специфично для этой фичи                               |
| **Часовые пояса**                                                                         | Везде `Europe/Moscow` (МСК). UNIQUE индекс использует `AT TIME ZONE 'Europe/Moscow'`. Все cutoff (10:00, 22:00) — в МСК. Сервер может быть в UTC, это нормально |
| **Manual delivery service detection**                                                     | Не нужна на этапе миграции. Логика работает одинаково для всех служб — единственное отличие в том, КТО ставит `expected_return_date` (API или клиент вручную)   |
| **«Бессрочный trash»** — со временем заказы накопятся                                     | Открытый вопрос. На v1 не решаем. В UI можно фильтровать `trash` по умолчанию, добавить вкладку «Архив»                                                         |
| **Удаление dispose-trash хендлера** ломает старые job-ы                                   | Cleanup-скрипт (см. секцию 3) удалит pending. Запустить после миграции, до перезапуска воркера                                                                  |
| **Существующий `complete_return` action**                                                 | Должен продолжать работать. В рефакторинге его можно завернуть так, чтобы он создавал `return_pickup_attempts` запись с `result='success'` если её ещё нет      |

## Список изменяемых файлов

| Категория              | Файл                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| Миграция               | `supabase/migrations/20260221000001_return_pickup_mechanics.sql` (новый) |
| Константы              | `src/lib/constants/returns.ts` (новый)                                   |
| Транзишены             | `src/lib/orders/transitions.ts`                                          |
| Лейблы                 | `src/lib/constants/order-status.ts`                                      |
| Очереди                | `src/lib/jobs/queues.ts`                                                 |
| Воркер                 | `src/lib/jobs/worker.ts`                                                 |
| Хендлер trash          | `src/lib/jobs/handlers/move-to-trash.ts`                                 |
| Хендлер return-arrived | `src/lib/jobs/handlers/return-arrived.ts`                                |
| Хендлер dispose        | `src/lib/jobs/handlers/dispose-trash.ts` (удалить)                       |
| Хендлер trumpet        | `src/lib/jobs/handlers/trumpet-notify.ts` (новый)                        |
| Бизнес-логика          | `src/lib/orders/shipper-actions.ts`                                      |
| Telegram уведомления   | `src/lib/telegram/notifications.ts`                                      |
| API trumpet            | `src/app/api/shipper/returns/trumpet/route.ts` (новый)                   |
| API order detail       | `src/app/api/shipper/orders/[id]/route.ts`                               |
| UI returns tab         | `src/components/shipper/returns-tab.tsx`                                 |
| UI order card          | `src/components/shipper/order-card.tsx`                                  |
| UI bottom bar          | `src/components/shipper/bottom-action-bar.tsx`                           |
| UI owner order         | `src/app/(owner)/owner/orders/[id]/page.tsx`                             |
| UI client order        | `src/app/(client)/order/[productId]/page.tsx`                            |
| KPI хелпер             | `src/lib/orders/revenue-filter.ts` (новый)                               |
| KPI dashboard          | `src/app/api/owner/dashboard/route.ts`                                   |
| KPI orders             | `src/app/api/owner/orders/route.ts` (строки 204–252)                     |
| KPI clients list       | `src/app/api/owner/clients/route.ts` (строки 118–161)                    |
| KPI client detail      | `src/app/api/owner/clients/[id]/route.ts` (строки 42–67)                 |
| KPI products list      | `src/app/api/owner/products/route.ts` (строки 150–166)                   |
| KPI product detail     | `src/app/api/owner/products/[id]/route.ts` (строки 41–69)                |
| KPI leaderboard        | `src/app/api/leaderboard/route.ts` (строки 41–46)                        |
| KPI client stats       | `src/app/api/stats/route.ts` (строка 117)                                |
| KPI owner stats        | `src/app/api/owner/stats/route.ts` (строка 105)                          |
| KPI finance            | `src/app/api/owner/finance/route.ts` (строки 32–36)                      |
| KPI export             | `src/app/api/export/orders/route.ts` (строки 217–277)                    |
| Типы                   | `src/types/database.generated.ts` (после `npm run db:gen-types`)         |
| Документация           | `docs/BUSINESS_LOGIC.md`, `docs/DATABASE.md`                             |

## Фазы реализации

**Фаза 1 — БД и удаление disposed**

- Миграция, обновление транзишенов, удаление dispose-handler, snose pending jobs, генерация типов
- Verify: `npm run db:migrate`, `npm run db:gen-types`, `npm run build`

**Фаза 2 — Расчёт return_window_days**

- Обновить `return-arrived.ts`, `mark_return_arrived` action
- Verify: создать тестовый заказ с `expected_return_date` в прошлом, проверить запись

**Фаза 3 — move-to-trash с определением вины**

- Расширить хендлер, добавить refund при платформенной вине
- Verify: симулировать orderId без попыток → fault=platform + refund; с 3 попытками → fault=client

**Фаза 4 — Trumpet-сессии (backend)**

- Новые таблицы (уже в Фазе 1), API, BullMQ-хендлер, Telegram-шаблоны
- Verify: нажать → проверить записи попыток + job в очереди; отменить → проверить удаление; подождать 30 мин → проверить отправку уведомлений

**Фаза 5 — Кнопки результата (backend + shipper UI)**

- `mark_pickup_attempt` action, кнопки в order-card
- Verify: пройти полный цикл (trumpet → результаты) на тестовых заказах

**Фаза 6 — Trumpet UI отправщика**

- Returns tab кнопка, состояния, отмена
- Verify: визуальная проверка + клик-тесты через Playwright MCP

**Фаза 7 — Trash UI обеих сторон**

- Telegram-кнопки на странице заказа
- Verify: визуально

**Фаза 8 — KPI фильтры (полный аудит, 11 файлов)**

- Создать `src/lib/orders/revenue-filter.ts` с `isRevenueCounted` и константами
- Применить `isRevenueCounted` во всех 11 файлах из таблицы (dashboard + 10 из предыдущего аудита)
- Везде убрать упоминания `disposed` (статуса больше нет)
- Verify:
  1. Создать тестовые заказы каждого типа (cancelled, return_completed, trash+platform, trash+client, completed)
  2. Открыть все страницы: dashboard, owner/orders, owner/clients, owner/clients/[id], owner/products, owner/products/[id], owner/finance, owner/stats, leaderboard, экспорт
  3. Сверить, что выручка/прибыль/счётчики везде одинаковые и НЕ включают cancelled/return_completed/trash+platform
  4. Убедиться, что trash+client учитывается в выручке (деньги остались у селлера)

**Фаза 9 — Документация**

- BUSINESS_LOGIC.md, DATABASE.md, handoff.md

## Верификация end-to-end

1. **Сценарий «всё работает (API-служба)»**:
   - Заказ → completed → клиент инициирует возврат через СДЭК → `return_in_transit` → API ловит прибытие → `return_arrived`, `return_window_days = 14`
   - День 1: trumpet → попытка создана → отправщик идёт → «Забран» → `return_completed`, депозит вернулся
   - ✓ Ожидание: заказ в `return_completed`, депозит на балансе клиента

2. **Сценарий «вина платформы»**:
   - Заказ в `return_arrived` 14 дней, отправщик ни разу не нажал trumpet
   - День 14: BullMQ `move-to-trash` → попыток 0, требуется 3 → fault=platform, depo refund
   - ✓ Ожидание: статус trash, fault_party=platform, депозит вернулся, в KPI не считается

3. **Сценарий «вина клиента (3 попытки)»**:
   - 3 разных дня отправщик жал trumpet → 3 попытки → каждый раз «неверный код»
   - День 14: 3 ≥ 3, есть wrong_code → fault=client, депозит НЕ возвращается
   - ✓ Ожидание: trash, fault_party=client, fault_reason=wrong_data, в KPI считается

4. **Сценарий «поздний репорт клиента»**:
   - Манульная служба, клиент создал возврат с `expected_return_date` 13 дней назад
   - Немедленно → `return_arrived`, `return_window_days = 1`
   - Через 1 день → trash, авто fault=client (late_report), нет даже шанса на попытки
   - ✓ Ожидание: trash, fault_party=client, fault_reason=late_report

5. **Сценарий «отмена trumpet»**:
   - Отправщик нажал trumpet в 11:00 → 5 попыток создано
   - В 11:05 нажал «Отмена» → попытки удалены, клиентам уведомление «ложная тревога», сессия cancelled
   - В 11:10 пробует снова → ✓ работает (UNIQUE индекс игнорирует cancelled)

6. **Сценарий «trash с Telegram-разбором»**:
   - Заказ в trash с fault=platform → клиент видит badge, кнопку «Написать продавцу»
   - Клик → открывается `t.me/{owner_username}`
   - ✓ Ожидание: ссылка работает, никаких блокировок UI

## Открытые вопросы для следующих сессий

1. **«Бессрочный trash»** — нужно ли архивировать старые trash-заказы (>90 дней)? Сейчас они будут копиться в активных запросах. Решение в будущем — отдельный фильтр на странице.
2. **Отчётность по вине** — может, нужна метрика «% trash с виной платформы» в аналитике, чтобы следить за качеством работы отправщиков.
3. **Telegram-username клиентов** — у всех ли есть `telegram_username`? Если нет, кнопка «Написать» должна быть disabled с подсказкой.

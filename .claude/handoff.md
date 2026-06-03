# Project state — техническое состояние

Общий журнал технического состояния проекта (поддерживается командой).
Бизнес-логика — в [`docs/BUSINESS_LOGIC.md`](../docs/BUSINESS_LOGIC.md);
этот файл — про что сделано, что в работе, что открытым техдолгом.

## ✅ Закрытые фазы

- **Phase 0a/0** — инфраструктура, БД, рефакторинг.
- **Phase 1** — Telegram-боты (5 шт.: customer / partner / owner /
  shipper / director).
- **Phase 2** — Owner Panel (`/owner/*`) + Shipper PWA (`/shipper/*`).

## ▶ Текущая фаза: Phase 3 — Авито-интеграция

Entry point — [`docs/AVITO_INTEGRATION_BRIEF.md`](../docs/AVITO_INTEGRATION_BRIEF.md).
AI-продажник для Авито-магазинов; принципы AI-продаж см.
`docs/AI_SALES_PRINCIPLES.md` (если создан).

## 🔧 Открытые техдолги

### Бизнес-логика

1. **Shipper PWA — мёртвый возвратный flow.** `executeStartReturn` /
   `executeMarkReturnArrived` (§6.1) — bottom-action-bar возвратные
   ветки противоречат канону (возврат инициирует только клиент). Удаление
   каскадит в page.tsx (handlers/modals/batch-actions). Есть UX-вопрос:
   нужны ли batch-операции на возвратах вообще, или только per-card §6.4.

### Технические доделки

2. **Страница Безопасности (`/owner/security`).** Бэкенд работает
   (4 детектора: return_abuse / frequent_cancellation / rapid_orders /
   high_debt; ежедневный cron 00:30 МСК; risk-profile view; resolve-API).
   UI на ~30%: алерты выводятся **сырым JSON** вместо человеческого
   текста, нет кнопок действий на алертах (resolve API есть, но не
   подключено к кнопкам), нет фильтров/архива. Минимальный план довода
   — см. секцию «Страница Безопасности — план» ниже.

3. **`vibe_replay` не в `fraud_alerts.alert_type` CHECK.** Anti-replay
   для +ВАЙБ-чеков (см. канон §8.1) шлёт Telegram-алерт владельцу через
   `notifyOwnerSecurityAlert({ alertType: "vibe_replay" })`, но запись в
   БД-таблицу `fraud_alerts` не создаётся (тип не разрешён). Чинится
   вместе с пунктом 2.

4. **Telegram-пуш из cron-детекторов.** `notifyOwnerSecurityAlert`
   существует, но из `run_fraud_detectors` handler'а не вызывается —
   ежедневные алерты копятся в БД, владелец узнаёт только при заходе на
   страницу.

5. **Полировка (финальная фаза).** Lint-долг ~21 файл + снять
   `eslint.ignoreDuringBuilds` в `next.config.mjs`; мёртвый pg-NOTIFY
   триггер `notify_size_quantity_restored` + канал `auto_resume_problem`
   (нет LISTEN-консьюмера; реальный механизм — явный
   `scheduleAutoResumeProblem`, см. канон §11.1); легаси-лейблы в
   `smart-alerts.tsx` и `notifications.ts` (`self_referral` /
   `deposit_abuse` / `duplicate_fingerprint` убраны из constraint, но
   висят в map'ах); мёртвая настройка `trash_to_disposed_days`;
   NOT NULL / guard для `partner_commission_snapshot`.

6. **Финальная приёмка** — автономный Playwright-прогон всех страниц/
   механик против канона свежим взглядом (устойчив к смене разработчика/
   контекста).

> Закрытые техдолги недавних сессий (Пробел А/Б, дуал-реестр
> `partner_owner_debts`, auto-resume → общий пул) — см. журнал ниже.

## 📋 Журнал значимых изменений

### Phase G.5 — partner-bot post-payment (2026-05-26)

Закрыт техдолг #5 (Пробел Б) — партнёр теперь может закрыть свою
сторону цикла без участия владельца.

- **partner-actions.ts** — новый модуль с
  `executePartnerMarkSent` / `executePartnerMarkReturnPicked` /
  `executePartnerCancelNoStock`. Симметрично shipper-actions, но без
  shipper-specific логики (claimed_by / shipper_rate_snapshot /
  adjustActualStock).
- **«📦 Мои заказы»** в partner-bot — заменили линейный
  `sendActiveOrders` на интерактивный список с фильтрами (Активные /
  Завершённые / Отменённые / Все) + кликабельные карточки + контекстные
  кнопки. Индикаторы статуса учитывают склад: `source_warehouse='partner'` →
  🚚/⚠️ с кнопками; `owner_warehouse` → 📦 info-only.
- **Подтверждение оплаты упрощено** — «N нет» теперь сразу отменяет
  pending без выбора причины. 3 inline-кнопки (`partner-reject:`),
  `partner-money:yes/no` flow и переспрос «деньги пришли?» выпилены —
  логика «нет товара/размера» переехала в карточку отправки (это
  семантически верное место).
- **Digest `partner-receipts-digest`** расширен в общий «📋 Список
  дел партнёра». 3 секции: 💳 чеки, 🚚 на отправку, ⚠️ забрать
  возврат. Окно и step не меняем (`partner_notify_window_*` +
  `partner_digest_step_hours`).
- **Trash `source_warehouse='partner'` без fault_party** — sweep
  `sweepStuckPickupByDaily` для партнёрского `source_warehouse='partner'`
  возврата ставит `fault_party=NULL` (не «вина платформы»),
  notifyOwnerTrashedPlatformFault для таких НЕ шлётся. DM клиенту
  с контактом партнёра. Канон §6.5 п.7.
- **Partner-isolation guard** в [shipper-actions.ts](../src/lib/orders/shipper-actions.ts)
  — `fetchAvailableReturnsForSize` и cascade siblings теперь фильтруют
  по `partner_id` (NULL ↔ NULL для owner-source, X ↔ X для партнёра).
  Defensive — de-facto уже изолировано через `product_size_id`.

Канон §10.2.1 / §10.2.2 / §10.3 / §6.5 / §11.1 переписаны.
Техдолги #4 (Пробел А) и #5 (Пробел Б) закрыты.

### Order lifecycle hardening (2026-05-26)

Большой проход по дырам в жизненном цикле заказа — фазы A-D.

- **Фаза A — каскад «нет товара» через выбор отправщика.** БД-триггер
  `cascade_problem_orders` снесён (миграции `20260526000030/000031`);
  логика теперь в коде [`executeMarkProblem`](../src/lib/orders/shipper-actions.ts).
  Отправщик в PWA-модалке выбирает scope: «только на этот заказ» (`single`)
  или «на все заказы по этому размеру» (`all`). Для каждого problem-заказа
  ищется свободный возврат FIFO по `send_by` и привязывается. Если
  возврата нет — заказ моментально → `cancelled` с
  `cancel_reason='out_of_stock_no_return'` и refund'ом по канону §9.2
  (owner-source — credit на баланс; partner-source — DM партнёру + клиенту
  с контактами). Канон §11.1 переписан под новый flow. Batch-режим
  всегда `scope='single'`.

- **Фаза B — единый ночной обход для send_by и pickup_by.** Per-order
  BullMQ-будильник `scheduleExpirePickupBy` удалён симметрично send_by
  (memory [send_by_expiry_architecture]). Новый
  `sweepStuckPickupByDaily` в 00:03 МСК — один cron-тик с
  `sweepStuckSendByDaily`. `pickup_by` теперь NOT NULL (миграции
  `20260526000040/000041`, backfill `created_at + 7 days`).
  `cancelExpirePickupBy` оставлен как safe-noop для orphan jobs в Redis.

- **Фаза C — UX-дыры в возвратном flow.**
  - Три разных текста клиенту при попытке забора возврата:
    `wrong_tracking` (есть кнопка «Обновить трек возврата»),
    `wrong_code` (код выдаёт служба, обновляется каждые 24ч —
    обновлять в день попытки бессмысленно), `not_found` (отправщик
    был, посылки нет — проверь что отправил + @support). Helper
    `notifyCustomerPickupAttemptFailed` в [notifications.ts](../src/lib/telegram/notifications.ts).
  - `notifyCustomerOrderTrashed` — «напиши в чат» заменено на
    `@support_username` из `business_settings`. Для партнёрских
    отдельная ветка с контактом партнёра.
  - DM `notifyOwnerTrashedPlatformFault` владельцу при утиле с
    `fault_party='platform'` (owner-source only) — закрывает TODO
    Phase C в [move-to-trash.ts](../src/lib/jobs/handlers/move-to-trash.ts).
    Адресация: директор → fallback на владельца.
  - Бейдж `fault_party` в `/owner/orders/[id]` — «🟠 Наша вина —
    верни клиенту N₽» / «⚪ Вина клиента» для status=trash.

- **Фаза D — фильтр партнёрских заказов.** Параметр
  `source: 'all'|'owner'|'partner'` в API/сервисе/хуке/UI
  ([orders-filters.tsx](../src/components/owner/orders/orders-filters.tsx)).

- **bad_barcode self-service** (за день до фаз A-D). Клиент в карточке
  заказа в боте жмёт «✏️ Обновить трек отправки» → мини-wizard ввода →
  заказ возвращается в `paid` (общий пул, claimed_by сбрасывается),
  problem_type очищается. Закрыло дыру «текст обещал автоматику, которой
  нет». Сообщение `notifyCustomerOrderProblem` для bad_barcode
  переписано под кнопку.

- **send_by NOT NULL + backfill** (за день до фаз A-D). 42 исторических
  заказа без даты отправки получили `created_at + 7 days`. Миграции
  `20260526000010/000020`. Ночной обход [sweep-expired-orders.ts](../src/lib/jobs/sweep-expired-orders.ts)
  расширен `.or(send_by.is.null,send_by.lt.${today})` — защита на
  случай регрессии. UI карточки заказа: «не задано» вместо «1 января
  1970». Per-order `scheduleExpireSendBy` удалён, остался только
  ежедневный sweep.

### Owner Panel — переработка финансовых страниц (2026-05)

- **Финансы ↔ Аналитика merge.** Аналитика стала главной точкой обзора
  (FinancialHero + TrendChart + новая `FinanceSummaryCard` bridge).
  Финансы — операционная страница (3 вкладки: Расходы / Выплаты /
  Касса) + slim-сводка наверху. Удалён мёртвый легаси старой мульти-
  теннант модели: «Доход с подписок» (ссылка на несуществующий
  `/owner/subscriptions`) и вкладка «Платформа» (битый
  `/api/owner/platform/finance`, «комиссия платформы/селлеры» — в
  single-tenant нет селлеров). Удалены файлы: `platform-tab.tsx`,
  `use-owner-platform-finance.ts`, `kpi-cards.tsx`, `finance-donut.tsx`,
  `products-tab.tsx`, `product-roi-bar.tsx`. Канон §9.8 переписан.

- **«Пришло на карту»** (`summary.cashInflow`) — реальный кэш-инфлоу за
  период: оплаты заказов картой/СБП (`paid_at IN period AND payment_
method NOT IN ('balance','deposit')`, инфлоу = `client_price −
  applied_balance`) + +ВАЙБ-погашения owner-route (`vibe_payments.
confirmed_at IN period AND payment_method_id IS NOT NULL`) + комиссии
  партнёров (`partner_commission_paid_at IN period`). Фильтр — по
  событию получения, не по `created_at` заказа. Разбивка по 3 источникам
  отдаётся в `summary.cashInflowBreakdown`.

- **Касса разделена на 2 направления.** «Балансы клиентов» (пассивная
  сумма на их счетах — не активный запрос на выплату; `customer_balance >
0`) vs «Должны тебе» (+ВАЙБ-долг + комиссии партнёров, ожидаемый кэш).

- **Relation-метки** под каждой ячейкой slim/bridge: «итог», «реальный
  кэш», «− из прибыли», «памятка · не в прибыли», «в прибыли · ждём
  поступления» — унифицированный нейтральный pill + цветная точка.

- **TrendChart на Аналитике** — добавлена метрика «Расходы» (`#FF2D55`,
  бакетируется по тем же MSK-дням что и заказы, по `expense_date ||
created_at`; в Promise.all API текущий+прошлый период) + дельта ROI
  vs прошлый период в FinancialHero (`roiChange`).

- **ROI-полоса на `/owner/products`** — восстановлена оригинальная
  механика из бывшей вкладки «Товары»: `paybackPercent =
revenue / (purchasePrice × totalInitial) × 100`. Фаза 1 (<100%):
  линейный fill, красный <50% / оранжевый 50–99%. Фаза 2 (≥100%):
  циклично в текущем 100-юнит-диапазоне, зелёный с glow + range-label
  («200–300%»). Без данных (totalInitial=0) — серая полоса той же
  высоты + «нет данных» (карточки не прыгают).

- **API `/owner/products` → канон §9.3.** Был только `status='sent'`,
  стало `paid/collecting/sent + return/trash/problem` (+ `return_done`
  с `bad_quality`); используется `ownerRevenue` (партнёрский =
  `partner_commission_snapshot`, свой = `client_price`).

### Деньги — correctness фиксы (2026-05)

- **#2 Anti-replay для +ВАЙБ-чеков** (канон §8.1) — закрыта дыра
  двойного погашения долга повторным чеком. Колонка
  `vibe_payments.operation_id` + partial-UNIQUE (миграции
  `20260519000010`/`…000020`). `recognize-receipt` (owner-route) до
  создания платежа проверяет оба реестра (`orders.vision_operation_id`
  - `vibe_payments.operation_id`) — на replay vibe_payment НЕ
    создаётся, `is_paid` не трогается, клиенту терминальный отказ,
    владельцу security-алерт (тип `vibe_replay`), факт в `activity_log`.
    `match-receipt` (заказ-flow) тоже проверяет vibe-реестр.

- **#5 Auto-resume на size-editor** (канон §11.1). `replace_product_
sizes` был единственным путём рестока, не подключённым к auto-resume
  problem-заказов (триггер `notify_size_quantity_restored` шлёт
  `pg_notify` в мёртвый канал — LISTEN-консьюмера нет; реальный
  механизм = явный `scheduleAutoResumeProblem` после рестока). Роут
  `/api/owner/products/[id]` теперь шедулит auto-resume для размеров,
  ушедших 0→>0 (точно условие триггера, guard «qty=0 не оживляет»).

- **Модель выплат отправщикам** — 2 режима (`pendulum|fixed`), ledger
  §9.6 выпилен, прибыль §9.4 вычитает `shipper_rate_snapshot` (триггер
  при `sent`), канон §9.4/9.5/9.6/14.4 переписан.

- **«Касса» §9.8** — обязательства владельца (баланс клиентов +
  +ВАЙБ-долг + партнёрский долг §10.4); распределение по экранам:
  Аналитика (bridge-карточка), Финансы (вкладка), Дашборд (зеркало-
  карточка).

- **Аудит выручки §9.3/§9.4** — 5 мест считали мимо общего хелпера
  (customers list, owner/stats, export, orders-service, order-card) →
  сведены к `owner-revenue`.

- **Брак-диспут возврата** (§6.4/§6.7) — починен двойной баг (триггер
  возвращал деньги и не учитывались в выручке); теперь деньги у
  владельца и в выручке.

### Структурные cleanup

- **Канон-статус «завершён» = `sent`** (§4.2), не `completed` — все
  легаси-вхождения `status='completed'` пересвипнуты по проекту.
- **Dual-field `claimed_by` vs `assigned_shipper_id`** — закрыт desync-
  баг (миграция `20260516000050` drop column); `claimed_by` —
  единственное поле принадлежности заказа отправщику.

## 🔧 Страница Безопасности — план довода

Минимальный комплект, чтобы страница стала рабочей:

1. **Человекочитаемые тексты алертов** по типу детектора. Замена `<pre>
JSON.stringify(details)</pre>` (page.tsx:264) на шаблон:
   - `frequent_cancellation`: «Клиент отменил `N` из `M` заказов (`X`%,
     порог `Y`%)».
   - `return_abuse`: «Клиент вернул `N`/`M` заказов (`X`%, порог `50`%)».
   - `high_debt`: «Долг `X ₽` / лимит `Y ₽` (`Z`% от лимита)».
   - `rapid_orders`: «`N` заказов за последний час (порог `5`)».
   - `vibe_replay` (новый, см. ниже): «Чек повторно прислан — operation_id
     `X` уже использован».

2. **Кнопки действий** на каждом алерте: «Закрыть» (PATCH
   `/fraud-alerts/[id]` со `status=resolved`, API уже работает),
   «В работу» (`status=investigating`), «Открыть карточку клиента»
   (link уже есть). Опционально — поле комментария на resolve.

3. **`vibe_replay` в БД.** Миграция: расширить CHECK-constraint
   `fraud_alerts.alert_type` (+ label-map). `recognize-receipt` при
   детекте replay'а — пишет запись в `fraud_alerts` (severity='high',
   details = `{ operation_id, used_for, customer_id }`), параллельно
   шлёт Telegram-уведомление (уже шлёт).

4. **Telegram-пуш из cron-детекторов.** В handler'е
   `run-fraud-detectors.ts` после получения количества новых алертов —
   вызвать `notifyOwnerSecurityAlert` для свежесозданных (тип +
   количество за день).

5. **Чистка легаси-лейблов.** В `smart-alerts.tsx` и `notifications.ts`
   убрать `self_referral`, `deposit_abuse`, `duplicate_fingerprint` —
   constraint их давно не пропускает, в коде только захламляют.

Дальше — фильтрация по типу/severity/дате, история resolved-алертов,
trend snapshots (`security_snapshots` table есть, но не заполняется).

## 🧰 Окружение

- `npm run dev:all` — Next.js + worker + 5 ботов в polling. Шорткат
  «п» в чате-ассистенте обычно = kill портов 3000/3001 + `dev:all` в
  фоне (договорённость пользователя с ассистентом, не системная).

### ⚠️ Telegram-боты: почему кнопки иногда «не отвечают» (и как не сломать)

**Симптом:** сделал правку в коде → inline-кнопки бота (например AI-фото
«Четко/Переделай») или команды перестали отвечать. Кажется, что фича сломалась.

**Причина — НЕ в коде, а в доставке апдейтов:**
1. **Рестарт `tsx watch`.** Любая правка в `owner-bot.ts` (или в файле,
   который он импортирует: `queues.ts`, `notifications.ts`, хендлеры джоб
   и т.п.) перезапускает процесс `[bots]`. Клик, попавший в окно рестарта
   (~5 сек), **теряется**: Telegram long-polling сдвигает offset при
   получении, и апдейт не передоставляется (`getWebhookInfo` →
   `pending_update_count=0`, в логе бота клика нет).
2. **Два поллера на один токен** = Telegram 409, апдейты делятся между
   ними. Источники: запущено **несколько `dev:all`**; ИЛИ прод-инстанс
   слушает тот же `TELEGRAM_OWNER_BOT_TOKEN` (общая инфра — родственно
   проблеме общего Redis-префикса, см. memory `project_avito_queue_prefix`).

**Важно: кнопки идемпотентны.** Превью остаётся `status='pending'`,
клавиатура НЕ снимается до успешной обработки → **повторный клик после
того, как бот поднялся, срабатывает**. Потерянный клик — не «навсегда
сломано».

**Как не наступать:**
- Держать **ровно один** `dev:all` (дубли → 409, см. инцидент 2026-05-31).
- После правки бота/его импортов — дождаться в логе `✅ [owner] started:
  @littleturtleassistantbot`, и только потом тестировать кнопки.
- Кнопка «не сработала» → подождать пару секунд (бот мог рестартиться) и
  **кликнуть ещё раз**.
- Для настоящей изоляции dev/prod — **отдельный bot-токен в `.env.local`**
  (через @BotFather), чтобы прод никогда не конкурировал за апдейты.

**Быстрая диагностика:** в `owner-bot.ts` стоит лёгкий логгер входящих
апдейтов (`[owner-bot] ⇐ update <id> from=<chatId> <kind>`). Жмёшь кнопку →
в `[bots]`-логе появилась строка = бот апдейт получил (ищи баг в хендлере);
**тишина** = апдейт ушёл другому поллеру или бот был в рестарте. Плюс
`getWebhookInfo` (`pending_update_count`, `last_error_message`).

**✅ Корневой фикс (2026-06-01) — кнопки тормозили / «0 реакции» на медленной сети.**
Код хендлера был верный (генерации одобрялись в БД), не доходил/тормозил отклик. Две причины:
1. **undici connect-timeout 10с** рубил живые-но-медленные соединения к Telegram/Supabase
   (`ConnectTimeoutError`). → Глобальный устойчивый dispatcher
   [`src/lib/net/resilient-dispatcher.ts`](../src/lib/net/resilient-dispatcher.ts)
   (connect 30с / headers 60с / body 120с), импортируется ПЕРВЫМ в `worker` / `dev-bots` /
   `instrumentation`. Лечит и приём кликов, и записи в БД, и Gemini («пришло N из 5»).
2. **grammY обрабатывает апдейты последовательно**, а в callback-хендлере висели `await` сетевых
   вызовов → клики копились и «отвисали пачкой». → `aiphoto:ok`/`aiphoto:redo` переписаны на
   НЕБЛОКИРУЮЩИЕ: `answerCallbackQuery()` без `await` (мгновенный ack), вся работа в `void(async()=>{})`.
   Правка подписи — `editCaptionResilient` (ретраи; «not modified» = успех).
Правило на будущее: в callback-хендлерах НЕ держать `await` тяжёлых/сетевых операций — выносить в фон.

- **Probe pattern** для проверки денег/склада/заказов:
  `scripts/_tmp-*.ts` (`@supabase/supabase-js` + `dotenv .env.local`,
  не app-client; чистить временные скрипты после выполнения).
- **Миграции**: `npm run db:push` → `npm run db:gen-types`. Одна
  миграция = одна SQL-команда (multi-statement лимит Supavisor); DROP
  - CREATE с новой сигнатурой — два файла. Нумеровать после последней
    применённой.

## 📐 Конвенции работы с проектом

- **Канон — единственный источник правды** по бизнес-логике
  ([`docs/BUSINESS_LOGIC.md`](../docs/BUSINESS_LOGIC.md)). Несоответствие
  → код приводим к канону, не наоборот. Канон поддерживается между
  правками.
- **Money/stock/orders → tsc + probe.** При любой правке этих областей
  обязательно прогнать `tsc` и временный probe-скрипт против реальной
  БД.
- **`next build` зелёный** — гейт корректности (type-check on; ESLint
  пропускается на build, см. `next.config.mjs` — lint-долг ушёл в
  финальную полировку).
- **Не реизобретать канон-формулы.** `isRevenueCounted`, `ownerRevenue`,
  `ownerCost`, `aggregateOwnerFinance` — единственный способ считать
  выручку/прибыль на любом экране.

## 🧪 Тест-данные

В БД могут быть сидовые тест-данные (`idempotency_key LIKE 'WT_SEED%'`,
`customers.name LIKE 'WT_SEED%'`, `expenses.description LIKE 'WT_SEED%'`,
`shipper_payouts.note LIKE 'WT_SEED%'`). Использовались для визуальной
проверки финансовых страниц. **Снести перед финальной приёмкой**
(чистка по тегам; для customers — удалять с их `customer_balance_history`

- пересчёт `customer_balance = Σ history.delta` для соблюдения
  инварианта `customer_balance_audit`).

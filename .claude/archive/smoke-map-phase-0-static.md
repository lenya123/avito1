# Smoke-карта (фаза 0, облегчённая, статический анализ)

> ⚠️ **DELTA 2026-05-18 — снимок ниже устарел по товарному/денежному
> домену.** Сессии 2026-05-16…18 крупно поменяли: недостача (§11.4),
> модель партий (§11.5), категории фикс-5, размеры+замеры (§11.6),
> единая выручка/прибыль §9.3/§9.4 на 4 экранах, решение по модели
> выплат (2 режима, ledger выпиливается). Актуально — `.claude/
handoff.md` + `docs/BUSINESS_LOGIC.md`. Карту ниже использовать как
> файловую навигацию, поведение сверять с handoff/каноном.

> Создано: 2026-04-30. **Обновлено 2026-05-15** — Shipper PWA snapshot
>
> - problem-flow переработан + legacy-статусы вычищены. Метод:
>   статический анализ кода + сверка с
>   [`docs/BUSINESS_LOGIC.md`](../docs/BUSINESS_LOGIC.md) (канон, §11
>   переписан 2026-05-15).
>
> Зачем: трекать поверхность ботов и сверять с каноном. Отдельные
> snapshot'ы: [`owner-panel-snapshot.md`](owner-panel-snapshot.md)
> (24 стр + 54 API, 2026-05-14),
> [`shipper-pwa-snapshot.md`](shipper-pwa-snapshot.md) (6 стр + 14 API,
> 2026-05-15), [`shipper-pwa-audit.md`](shipper-pwa-audit.md) (дыры,
> 2026-05-15).

## TL;DR (на 2026-05-15, Shipper PWA база закрыта автономно)

- ✅ **Канон §11 переписан** — две независимые ветки статуса `problem`:
  `out_of_stock` (скрыт из таба отправщика, auto-resume/expire разрулят,
  DM владельцу с метриками) + `bad_barcode` (концепт «штрихкод»→«трек»,
  без DM владельцу, ручной undo). Старый «каскад на все заказы» снят.
- ✅ **Refund при cancel/expire** — критич баг закрыт: деньги клиента
  возвращаются на customer_balance (`executeCancelOrder`,
  `expire-send-by`, owner batch). Партнёрские — НЕ возвращаем (партнёр).
- ✅ **Legacy-статусы → канон §4.2** (19 файлов): awaiting_shipment→paid,
  in_transit/completed→sent, return_arrived→return и т.д. Фильтры
  молча возвращали 0 → ломали финансы/дашборд/аналитику. Backward-compat
  через STATUS_ALIASES + Zod enum.
- ✅ **Phase C job-lifecycle** — `safeCancelOrderJobs` заполнен,
  `executeUndoShip` re-schedule expire-send-by, batch cancel-таймер.
- 🟡 **Walkthrough Shipper PWA экран за экраном — частично**: таб
  «Собрать» пройден с пользователем; «Отправить/В пути/Возвраты/История/
  earnings/stock/profile» — только snapshot+статика, не walkthrough.
- 🟡 **Live-тест +ВАЙБ-pay** — старый техдолг с 2026-05-12, нужен Telegram.

## TL;DR (на 2026-05-14, фаза 2 Owner Panel закрыта + DoD-сверка)

- ✅ **Фаза 2 Owner Panel walkthrough-требования закрыты** (2026-05-14).
  14 коммитов, ~1700 строк, 7 миграций, 5 новых RPC. Подробно — в
  [`handoff.md`](handoff.md) секция «Сессия 2026-05-14». Главные
  закрытые требования: единая функция баланса клиента, KPI «новые
  клиенты» на Дашборде, KPI orders_taken отправщика, customer_contact
  в notification routing, orderId-aware «Написать владельцу» в
  customer-bot, пересылка чеков из обоих источников (RPC
  `get_order_receipts` UNION ALL).
- ✅ **DoD-сверка пройдена** (2026-05-14, вторая половина дня):
  пользователь попросил «точно ли всё закрыто из долгов/отложенных».
  Найдены 4 пробела (A-D) — A+B отложены как редкие сценарии, C+D
  реализованы. Долг по адресатам в /owner/clients/[id] (партнёр vs
  свой склад) + кнопка «На паузу» партнёра в /owner/partners/[id].
- ✅ **`location_city` обязательное поле** (commit `cd3e018`,
  2026-05-14) — закрыт техдолг от 2026-05-05. Миграция NOT NULL +
  backfill 'Москва' + Zod required в 3 API + UI required в 2 формах +
  cleanup if-веток в customer-bot. Однородность отображения сверена.
- ✅ **Модель чеков унифицирована** (2026-05-14): RPC
  `get_order_receipts(p_order_id)` сливает orders.receipt_storage_path
  (прямые оплаты) и vibe_payments через linkage vibe_payment_orders
  (долговые погашения). Helper `src/lib/orders/receipts.ts`
  (`getOrderReceipts` + `downloadOrderReceipt`) — тонкая обёртка для
  реюза. Один заказ может закрываться несколькими vibe-чеками.
- ✅ **Legacy `partner-request-requisites` flow выпилен** (2026-05-14).
  −208 строк в 7 файлах. БД-поле `partner_requisites_text` оставлено
  как audit для исторических заказов до refactor 2026-05-05.
- ✅ **Owner Panel dead-link'и закрыты** (2026-05-14): sidebar
  «Продавцы» → /owner/sellers (404) → теперь «Партнёры» →
  /owner/partners. Убрана ссылка «Все шиперы платформы» (404).
- ✅ **Q5 печать стикеров verified в коде** — Web Bluetooth драйверы
  Niimbot/ESCPOS/Xprinter в shipper-PWA уже есть.
- ✅ **Q6 «📢 В каталог» verified в коде** — full implementation
  (API + button + Modal + Telegram-канал).
- 🔴 **Shipper PWA UI walkthrough не трогали** — вторая половина
  фазы 2 из roadmap. На очереди.
- 🟡 **Live-тест single-order +ВАЙБ-pay** — старый техдолг с 2026-05-12,
  требует Telegram (cross-bot), твоя сторона.

## TL;DR (на 2026-05-12, фаза 1 закрыта)

- ✅ **#11 финальный sweep текстов ботов** выполнен 2026-05-12 (13
  сценариев, ~58 правок в 12 файлах: тон «ты» по всей системе,
  единый формат `№N` и `formatPrice()`). См. memory
  `bot_texts_tone_canon.md`.
- ✅ **Унификация подтверждения чеков** (2026-05-12). Канон:
  «один заказ в чеке — текстом «<номер> да/нет», группа —
  inline-кнопками». Удалены мёртвые callback'и `partner-confirm:yes/no`
  и `partner:received:` + функция `handlePartnerReceived` (~135 строк
  чистки в partner-bot.ts). `sendVibeDebtReceiptToPartner` получил
  параметр `useTextFlow` для single-order; `handlePaymentConfirmation`
  научен резолвить vibe_payment через `vibe_payment_orders` linkage.
- ✅ **Баг `update-shipper-scores`** PL/pgSQL `ambiguous shipper_id`
  закрыт миграцией 20260512000001 (директива `#variable_conflict
use_column`).

- ✅ **Build/tsc чистые.** `next build` и `tsc --noEmit` exit 0.
- ⚠️ **Lint: ~5 errors** (unused vars вроде `_job`, не блокеры runtime).
- ✅ **32 BullMQ-handler'а** (полный список — `src/lib/jobs/handlers/index.ts`).
  Включая новые с 2026-05-08: `shipper-pool-digest`,
  `expired-orders-morning-digest`, `withdrawal-requests-digest`.
- ✅ **business_settings** — расширилось до 25+ полей (catalog*channel_id,
  trumpet_notify_window*_, last*shipper_pool_digest_date,
  director*_, partner\_\*, send_by_today_cutoff и т.д.).
- ✅ **Owner panel** — 26+ страниц с новой кнопкой «📢 В каталог»
  на `/owner/products/[id]`, секциями trumpet-window и withdrawal в
  `/owner/settings`.
- ✅ **Публичный лендинг `/catalog`** (с 2026-05-08) — без авторизации,
  с модалкой и ZIP-выгрузкой фото.
- ✅ **shipper-bot переписан в чистый push-канал** (с 2026-05-08).
  Только `/start` для привязки. DM: срочный заказ, дайджест,
  выплаты, полночный откат.
- ✅ **partner-bot хвост закрыт** (2026-05-08). Активные заказы единым
  сообщением с 💳/✅/⏳ значками, кнопки «📢 Протрубить возвраты» и
  «💰 Должники», детализация в «Долг по комиссиям».
- ✅ **Withdrawal-flow рефактор** (2026-05-08) — резерв при создании,
  текстовое подтверждение «N да/нет», digest-reminder каждые 3ч.
- ✅ **Архитектурные вопросы фазы 1 закрыты** — см. memory
  `architecture_questions_closed.md`.
- ✅ **Концепция «бренд» выпилена** (2026-05-07).

## 1. Боты

### 1.1 customer-bot

| Параметр      | Значение                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Файл          | [bots/customer-bot.ts](../src/lib/telegram/bots/customer-bot.ts) (1531+ строк) + 4 sub-файла в `customer-bot/`                           |
| Структура     | core wizard заказа + my-orders, return-wizard, card-actions, profile                                                                     |
| Канон-маппинг | разделы 4, 5, 6, 12, 13                                                                                                                  |
| Реализация    | Phase 3.0 (skeleton) → 3.1 каталог → 3.2 чекаут → 3.3-3.5 платежи → 3.6-3.7 уведомления → Phase D (Мои заказы / возвраты / edit-actions) |

**Расхождения с каноном 12.5 (кнопки на карточке заказа клиента):**

| Статус        | Канон                                                        | Код                                                     | Совпадает? |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------- | ---------- |
| `paid`        | Отменить · Изменить срок                                     | ✅ обе                                                  | ✅         |
| `collecting`  | Отменить · Изменить срок                                     | ✅ обе                                                  | ✅         |
| `printed`     | (нет)                                                        | (нет)                                                   | ✅         |
| `sent`        | Заказать ещё раз · Оформить возврат                          | ❌ только «Оформить возврат» (TODO Stage 4)             | ⚠️         |
| `return`      | Изменить pickup_by · Обновить код · Отменить · Обновить трек | ✅ все 4                                                | ✅         |
| `return_done` | Заказать ещё раз                                             | ❌ ничего (TODO Stage 4)                                | ⚠️         |
| `trash`       | Переоткрыть возврат · Написать владельцу                     | ✅ обе                                                  | ✅         |
| `cancelled`   | Заказать ещё раз · Написать владельцу                        | ❌ только «Написать владельцу» (нет «Заказать ещё раз») | ⚠️         |
| `problem`     | Отменить заказ                                               | ✅                                                      | ✅         |

**Открытые вопросы для walkthrough фазы 1:**

- «Заказать ещё раз» — нужна ли в новом roadmap или решено убрать? В
  старом плане это был Stage 4. Если нужна — где сидит wizard заказа
  с предзаполненным товаром (нужно заново реализовать).

### 1.2 partner-bot

| Параметр      | Значение                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| Файл          | [bots/partner-bot.ts](../src/lib/telegram/bots/partner-bot.ts) (~2000 строк) |
| Канон-маппинг | раздел 10                                                                    |
| Реализация    | Полностью переписан 2026-05-08 в рамках «partner-bot хвост»                  |

**Текущая поверхность (после 2026-05-08):**

- Привязка через `?start=<invite_token>`.
- ⚙️ **Мои реквизиты** — статичные (текст или фото с QR), редактирует
  партнёр сам.
- 📦 **Активные заказы** — единое сообщение, две секции:
  - 🚚 В работе (paid) — со счётчиком +ВАЙБ-долгов «должны: X ₽»;
    💳 значок «в долг» для `is_paid=false`.
  - ↩️ Возвраты (return) — с ✅/⏳ значками по `return_code_updated_at`,
    кнопка «📢 Протрубить возвраты» (партнёрский trumpet).
- 💳 **Долг по комиссиям** — детализация заказов с `partner_commission_snapshot`,
  кнопка «💳 Оплатить» с реквизитами владельца.
- 💰 **Должники** (новая, 2026-05-08) — агрегация +ВАЙБ-долгов клиентов
  перед партнёром. Без действий, информационно.
- ✅ Подтверждение оплаты текстом «N да / N нет» (защита от случайного
  тапа). При «N нет» — уточнение причины.
- ❌ Кнопка «✏️ Указать трек» удалена (трек вводит клиент при оформлении).

### 1.3 owner-bot

| Параметр      | Значение                                                        |
| ------------- | --------------------------------------------------------------- |
| Файл          | [bots/owner-bot.ts](../src/lib/telegram/bots/owner-bot.ts)      |
| Канон-маппинг | разделы 9.7, 13 (DM-уведомления)                                |
| Реализация    | /start + текстовые/callback handler'ы + DM-канал важных алертов |

**Поверхность (после 2026-05-08):**

- Текстовое подтверждение **withdrawal_requests** — «N да» / «N нет»
  (где N — `withdrawal_number` из отдельного sequence). Парсер
  устойчив к регистру и пробелам. RPC `approve_withdrawal_request v3`
  / `reject_withdrawal_atomic`.
- Текстовое подтверждение **partner debt** — закрытие комиссионных
  долгов партнёра.
- DM-получатель для регулярных алертов:
  - 🔥 Утренний 10:00 МСК со списком сгоревших заказов вчера +
    кто из shipper'ов в `work_days` на DOW(вчера).
  - withdrawal-requests-digest каждые 3ч в окне `director_notify_window_*`.
  - Эскалация с partner-receipts-digest / director-receipts-digest.
- DM-only, в группах не светится.
- **Полная переработка (#10) — впереди.** Команды (`/today`, `/pending`),
  замена кнопок на текст, заглушки `daily_summary` / `security_alert`.

### 1.4 shipper-bot

| Параметр      | Значение                                                                    |
| ------------- | --------------------------------------------------------------------------- |
| Файл          | [bots/shipper-bot.ts](../src/lib/telegram/bots/shipper-bot.ts) (~150 строк) |
| Канон-маппинг | раздел 13 (DM)                                                              |
| Реализация    | **Чистый push-канал** (полностью переписан 2026-05-08)                      |

**Поверхность:**

- Только **`/start`** для привязки `telegram_id` к shipper-записи.
  Поиск по `telegram_username`, замена fake negative `telegram_id` на
  real, DM с приветствием + 64-hex `site_key` + ссылка на
  `/shipper/login`.
- Никаких меню, кнопок, команд (`/stats`, `/help` — выпилены), никакой
  email/пароль-логики.
- Любой ввод вне `/start` игнорируется.

**DM-уведомления, которые приходят отправщику:**

- ⚠️ Срочный новый paid+send_by=сегодня — мгновенно, всем shipper'ам.
- 🔔 Дневной дайджест после `send_by_today_cutoff` — pool_count +
  персональный urgent_count.
- 💰 Выплата готова / переведена.
- 🌙 Полночный авто-откат `collecting → paid` — список откатившихся.

**Регистрация:** см. memory `shipper_bot_canon.md`. Владелец создаёт
shipper'а в `/owner/shippers` с `@telegram_username`, отправщик шлёт
`/start` → бот сам делает всё остальное.

## 2. Owner panel

26+ страниц, все живые. Размеры (на 2026-05-08):

| Страница              | Строк | Заметки                                                      |
| --------------------- | ----- | ------------------------------------------------------------ |
| `/owner` (root)       | 5     | Редирект на `/owner/dashboard`                               |
| `/owner/dashboard`    | 7     | `<DashboardPage role="owner" />` (shared component)          |
| `/owner/analytics`    | 7     | `<AnalyticsPage role="owner" />` (shared component)          |
| `/ai-sales`           | 81    | Phase 3 опережает roadmap! Реальный (QuickStats + DraftList) |
| `/clients`            | 141   | Список клиентов                                              |
| `/login`              | 154   | Вход владельца                                               |
| `/more`               | 187   | Доп. меню                                                    |
| `/shippers`           | 190   | Список отправщиков                                           |
| `/partners`           | 207   | Список партнёров                                             |
| `/ai-sales/analytics` | 225   | Аналитика AI                                                 |
| `/payouts`            | 262   | Выплаты отправщикам                                          |
| `/ai-sales/settings`  | 262   | Настройки AI                                                 |
| `/finance`            | 275   | KPI/donut/4 таба + расходы/выплаты модалки                   |
| `/security`           | 280   | Безопасность                                                 |
| `/partners/[id]`      | 292   | Карточка партнёра                                            |
| `/payment-methods`    | 447   | Реквизиты владельца (для `next_payment_method`)              |
| `/shippers/[id]`      | 454   | Карточка отправщика (включая 3 KPI канона 9.5?)              |
| `/orders`             | 515   | Список заказов                                               |
| `/clients/[id]`       | 578   | Карточка клиента (+ВАЙБ-управление, customer_balance)        |
| `/products/new`       | 627   | Новый товар                                                  |
| `/products`           | 672   | Каталог товаров                                              |
| `/orders/[id]`        | 738   | Карточка заказа (статус, история)                            |
| `/products/[id]`      | 1148  | Редактирование товара                                        |
| `/settings`           | 1151  | Настройки магазина (бренд, реквизиты, лимиты, тексты)        |

**Новые поверхности (с 2026-05-08):**

- `/owner/products/[id]` — кнопка «📢 В каталог» + модалка
  `CatalogPublishModal` (выбор фото, порядок, шаблон текста).
  Постит в Telegram-канал из `business_settings.catalog_channel_id`
  через customer-bot.
- `/owner/settings` — `DigestScheduleSection` третьим блоком:
  trumpet-окно (`trumpet_notify_window_*`) для shipper- и
  partner-trumpet'ов. Раньше — хардкод 10:00–21:00 МСК.
- `/owner/finance` — withdrawal_requests с резервированием баланса
  при создании запроса; статус «Запрошено: N₽» в карточке клиента.
- `/owner/clients/[id]` — `FreezeControls` ручной заморозки с
  `required_payment_amount`, `frozen_debt_snapshot`. Кнопка
  «🌬️ Разморозить вручную» без погашения долга.

**Что проверить во время walkthrough'а фазы 2:**

- `/owner/shippers/[id]` — все ли 3 KPI канона 9.5.
- `/owner/finance` — соответствие выручки канону 9.3 (после слияния
  enum'ов: `paid + collecting + sent + return + trash + problem`,
  без `cancelled` и `return_done`).
- `/owner/orders/[id]` — есть ли «Вернуть N₽ клиенту» (канон 9.7 п.3).

## 3. Shipper PWA

| Страница    | Строк | Заметки                                 |
| ----------- | ----- | --------------------------------------- |
| `/profile`  | 111   | Профиль отправщика                      |
| `/login`    | 162   | Site_key 64-hex                         |
| `/earnings` | 469   | KPI/доходы                              |
| `/shipper`  | 792   | Главная — 5 табов, все Phase E операции |
| `/stock`    | 1291  | Склад: товары/размеры/инвентаризация    |

Плюс **публичный лендинг `/catalog`** (с 2026-05-08, технически в `app/catalog/`,
не в `(shipper)`-группе) — без авторизации, добавлен в `middleware.publicRoutes`.

**5 табов главной страницы (FILTER_STATUSES, после слияния enum'ов):**

- `collect` — paid + problem
- `ship` — collecting (флаг `barcode_printed`)
- `tracking` — sent
- `returns` — return
- `history` — return_done + trash + cancelled

**Реализованы все ключевые операции (Phase E):**
start_collecting / mark_printed / undo_print / cancel_order /
mark_problem / undo_problem / mark_sent / undo_ship / start_return /
complete_return / mark_return_arrived / set_size / dispute_return /
pickup_result (4 варианта).

**Что проверить:**

- Канон 6.4: «📢 Протрубить возвраты» — есть в `/api/shipper/trumpet`,
  но проверить UI на странице `returns` (один раз в день, серая
  кнопка «Использовано»).
- Канон 6.4: 4 кнопки результата на ПВЗ — реализованы (✅ Забран /
  Неверный код / Неверный трек / Нет на ПВЗ).
- Связка `executeMarkProblem` — каскад на остальные заказы того же SKU
  - размера (канон 11.2). Phase H закрыл, но walkthrough покажет.

## 4. БД и миграции

- **295 миграций** (на 2026-05-12). За 2026-05-08 — 35 файлов
  (withdrawal-flow, shipper-alerts, catalog-channel, trumpet-flow).
  Последняя миграция 2026-05-12 — `20260512000001_fix_update_shipper_scores_ambiguous.sql`
  (директива `#variable_conflict use_column` в RPC `update_shipper_scores`).
- Ключевые таблицы (актуальные): `customers`, `partners`,
  `vibe_payments`, `vibe_payment_orders`, `pending_orders`,
  `customer_balance_history`, `return_pickup_attempts`,
  `withdrawal_requests` (с `withdrawal_number` sequence),
  `status_history`, `business_settings` (25+ полей),
  `trumpet_sessions` (с `partner_id` для партнёрских trumpet'ов),
  `shipper_payout_periods`, `payment_methods` (с tier).
- Ключевые view: `customer_vibe_debt`, `partner_commission_debt`,
  `customer_risk_profile`, **`customer_balance_integrity_view`**
  (audit-инвариант balance == SUM(history.delta), drift = 0).
- Ключевые группы миграций 2026-05-08:
  - withdrawal-flow (16+ файлов): `request_withdrawal_atomic`,
    `cancel_withdrawal_atomic v1/v2`, `approve_withdrawal_request v3`,
    `reject_withdrawal_atomic`, `withdrawal_number` sequence.
  - shipper-alerts: `orders.urgent_alert_sent_at`,
    `business_settings.last_shipper_pool_digest_date`.
  - catalog-channel: `business_settings.catalog_channel_id`.
  - trumpet-flow: `trumpet_sessions.partner_id`,
    `trumpet_notify_window_*` в `business_settings`.
  - moscow-time: единый helper `src/lib/utils/moscow-time.ts`,
    выпил `+03:00` хардкода.
- ⚠️ **Legacy `seller_*` таблицы** — открытый техдолг, не дропнуты.

## 5. BullMQ-jobs

**32 handler'а** на 2026-05-08 в `src/lib/jobs/handlers/index.ts`.
Полный список см. `docs/BUSINESS_LOGIC.md §14`.

**Новые с 2026-05-08:**

| Job                             | Когда                                            |
| ------------------------------- | ------------------------------------------------ |
| `shipper-pool-digest`           | Cron каждые 30 мин (handler решает после cutoff) |
| `expired-orders-morning-digest` | Cron 10:00 МСК — DM владельцу о сгоревших вчера  |
| `withdrawal-requests-digest`    | Cron каждые 3ч — DM владельцу о pending запросах |

**Канонические jobs из §14 (все живые):** `recognize-receipt`,
`recognize-pending-receipt`, `expire-send-by`, `expire-pickup-by`,
`move-to-trash`, `daily-shipper-cleanup`, `trumpet-notify`,
`partner-request-requisites`, `notify-vibe-frozen`,
`auto-resume-problem`, `release-reservation`, `expire-pending-order`,
`expire-unpaid-order`, `partner-payment-expire`,
`partner-receipts-digest`, `director-payment-expire`,
`director-receipts-digest`.

**Avito-интеграция (фаза 3, активны при `AVITO_ENABLED=true`):**
`sync-avito-data`, `sync-avito-today-stats`, `sync-avito-orders`,
`avito-login`, `generate-sales-draft`, `send-approved-draft`,
`learn-from-corrections`, `aggregate-sales-stats`.

**Шипер-KPI:** `update-shipper-scores`, `build-shipper-payouts`,
`run-fraud-detectors`.

## 6. TODO Phase — большинство закрыто к 2026-05-08

Из 10 TODO старой нумерации (Phase C/D/E/F/G/H рефакторинга 2026-04-29)
закрыто по ходу фазы 1:

- ✅ Phase C `expire-send-by` schedule/cancel — реализовано в
  `queues.ts` `scheduleExpireSendBy` + cron-sweep.
- ✅ Phase F пополнение `customer_balance` при cancel/return — закрыто
  через триггер `auto_credit_customer_balance` (с idempotency-EXISTS).
- ✅ Phase H/E уведомление отправщику при `auto-resume-problem` — DM
  работает.
- ✅ Phase D DM клиенту при `expire-send-by` — `notifyCustomerOrderCancelled`.
- ✅ Phase F+ групповая оплата — реализована через multi-select в
  +ВАЙБ-flow (см. `customer-bot.ts:openVibeGroup`).

**Что осталось** (не блокеры фазы 1):

- [worker.ts](../src/lib/jobs/worker.ts) — алерты владельцу при
  критических ошибках + счётчики processed (фаза 4 наблюдаемость).
- Ставка отправщика — хардкод, не из `business_settings.shipper_rates`
  (фаза 7 коробочность).
- `recognize-receipt` для +ВАЙБ-погашений — финальные тексты на sweep
  фазы 1 #11.

## 7. Lint warnings

`next build` exit 0, есть warnings:

- `_job` / `_orderId` префикс-аргументы помечены unused — типичный
  паттерн в проекте, не блокер.
- `<img>` вместо `<Image />` — отложено в фазу 5 (редизайн).
- Несколько `react-hooks/exhaustive-deps` — мелкие, проверить в фазе 5.

## 8. Открытые вопросы — все закрыты на 2026-05-08

См. memory `architecture_questions_closed.md`. Все 8 архитектурных
вопросов фазы 1 либо закрыты в коде по ходу (`#2 групповая оплата`,
`#4 корзина`, `#6 ассортимент-канал`, `#7 никто-не-онлайн`), либо
отложены на свои фазы (`#1 Авито` / `#3 AI` / `#5 печать` / `#8
AI-ассистент`).

Технические TODO из walkthrough-notes (`director-receipts-digest`
фильтр, Phase F customer_balance) — тоже закрыты.

## 9. Что НЕ проверено в этой smoke-карте

- **Реальное прохождение в Telegram** (нужен живой запуск + аккаунт).
- **Owner panel UI как пользователь** (нужен логин + клик).
- **Shipper PWA UI как пользователь** (тот же).
- **Реальное состояние БД** (нет тестовых данных).
- **RLS-политики** (`npm run test:rls` не запускался — нужны
  credentials в `.env.test`).
- **AI-sales / Avito интеграция в коде** — не читал внимательно, фаза 3.

Эти зоны покрываются walkthrough-фазами 1 (Telegram) и 2 (Panel +
PWA). Эта карта только подсветила **где смотреть внимательно**.

---

## История решений по карте

### ✅ Исполнены к 2026-05-08 (по итогам фазы 1)

- **Канон §4.1 (`pending_orders` flow для не-+ВАЙБ)** — реализован
  2026-05-01. `orders` создаётся только после подтверждения оплаты;
  `pending_orders` с TTL 10 мин держит резервы во время ожидания чека.
- **shipper-bot полностью переписан** в чистый push-канал (2026-05-08).
  Email/пароль убраны, регистрация по `/start` и `telegram_username`,
  DM-уведомления по 4 типам событий.
- **partner-bot хвост закрыт** (2026-05-08). Активные заказы единым
  сообщением, кнопки «📢 Протрубить возвраты» / «💰 Должники»,
  статичные реквизиты в profile, текстовое подтверждение «N да/нет».
- **«Заказать ещё раз» вычеркнута из канона** — `sent`/`return_done`/
  `cancelled` без неё.
- **Канал-каталог + кнопка постинга** реализованы #7 (2026-05-08).
- **Архитектурные вопросы фазы 1** — все 8 закрыты или отложены, см.
  memory `architecture_questions_closed.md`.
- **Концепция «бренд» выпилена** (2026-05-07, 8 миграций).
- **Withdrawal-flow рефактор** (2026-05-08) — резерв при создании,
  текстовое подтверждение, digest-reminder каждые 3ч, audit-view.
- **Owner-bot шапка** — устаревшая ссылка на `dapper-hugging-wozniak.md`
  убрана.

### 📝 Открытые техдолги (не блокеры фазы 1)

- **Legacy `seller_*` таблицы** — 4 шт., не дропнуты. Открытый вопрос
  для фазы 7 коробочности.
- **`location_city` обязательный** — миграция NOT NULL пока не
  применена (memory `product_city_required.md`).
- **`docs/BUSINESS_LOGIC.md` §15 «Авито-заказы»** — пустой, заполняется
  в фазе 3.
- **Lint warnings** — `_job` префиксы, `<img>` вместо `<Image />`.
  Чистить в фазе 5/7.

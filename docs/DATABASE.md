# База данных (Supabase PostgreSQL)

> ⚠️ **DELTA 2026-05-18 — текст ниже (от 2026-04-27) ЧАСТИЧНО УСТАРЕЛ.**
> Свежая БД-правда: миграции `supabase/migrations/` +
> `src/types/database.generated.ts` + канон `docs/BUSINESS_LOGIC.md`.
> Добавлено/изменено в сессиях 2026-05-16…18 (детали — handoff):
>
> - **`stock_reconciliations`** (`20260516000090`) — журнал сверок
>   инвентаризации, §11.4. RPC `reconcile_product_stock` (атомарно).
> - **`product_batches`** (`20260518000040`) — журнал партий, §11.5.
>   RPC `add/edit/delete_product_batch`, `create_first_batch`, helper
>   `_recompute_product_from_batches`. `products.purchase_price` =
>   средневзвешенная из партий; `product_sizes.initial_quantity` = Σ.
> - RPC `restock_product_size`, `correct_product_size_quantity`
>   (`20260518000030`); `set_product_size_measurements`
>   (`20260518000090`); `product_sizes.measurements` jsonb (§11.6).
> - `create_product_with_sizes` переписан (`..080/100/110`): убраны
>   мёртвые `products.measurements`/`seller_id` (был сломан).
> - Дроп `orders.assigned_shipper_id` (`20260516000050`); дроп
>   cascade-problem триггера (`..060/070`); `product.category` →
>   фикс-5 (`20260518000070`).
> - **Мёртвое, выпиливается в след. сессии:** `shipper_ledger_entries`,
>   `shipper_payout_periods`, триггер `shipper_ledger_on_order_completed`
>   — см. handoff «модель выплат».
>
> ---

<<<<<<< HEAD
| Таблица                 | Описание                                         |
| ----------------------- | ------------------------------------------------ |
| `users`                 | Все пользователи (владелец, клиенты, отправщики) |
| `products`              | Товары                                           |
| `product_sizes`         | Размеры товаров с количеством                    |
| `orders`                | Заказы                                           |
| `payments`              | Платежи                                          |
| `suppliers`             | Поставщики                                       |
| `pickup_points`         | ПВЗ для отправки                                 |
| `favorites`             | Избранные товары                                 |
| `product_notifications` | Подписки на поступление                          |
| `referral_bonuses`      | Реферальные бонусы                               |
| `shipper_stats`         | Статистика отправщика                            |
| `expenses`              | Расходы бизнеса                                  |
| `activity_log`          | Аудит действий                                   |
| `notifications`         | Уведомления                                      |
| `settings`              | Настройки системы                                |
| `size_reservations`     | Временные резервы размеров                       |
| `user_fingerprints`     | Отпечатки устройств (антифрод)                   |
| `fraud_alerts`          | Алерты о подозрительной активности               |
| `avito_proxies`         | Пул IPv4 прокси для Avito сессий                 |
| `avito_browser_sessions`| Браузерные сессии Avito (cookies, fingerprint)    |
| `avito_items`           | Кеш объявлений Avito                             |
| `avito_chats`           | Кеш чатов Avito                                  |
| `avito_messages`        | Кеш сообщений Avito                              |
| `avito_orders`          | Кеш заказов Avito Доставка                       |
=======
> Состояние на 2026-04-27, после Stage 3 + Stage 3.12 (Dropshipper rework).
> Stage 3 (миграции 019–022): колонки доставки клиента в orders (019, частично
> дропнуты в 024), ручная заморозка с required*payment_amount (020), topic-id'ы
> супергруппы (021), таблица partners + партнёрские колонки на products/orders (022).
> Stage 3.10 (миграция 023): drop payments_topic_id (раздельные группы для
> заказов и чеков, см. handoff).
> Stage 3.12 (миграции 024–025): drop `orders.customer_delivery*\*`— клиенты
переходят на dropshipper-flow (трек вместо города/ПВЗ). 025 откатывает
ошибочно созданные дубли`dispatch_city`. Подробнее в разделе ниже.
Клиенты оптовика переехали в отдельную таблицу `customers`, добавлены +ВАЙБ-кредит, ферма платёжных карт, переписка, риск-профили.

## Архитектура

- **Single-tenant-per-install.** Один Supabase-проект = один оптовик.
- **Роли:** `owner` (главная рабочая роль), `shipper` (PWA сборки/отправки), `admin` (вендорская для поддержки). CHECK на `users.role` сужен до этих трёх — legacy `client`/`seller` удалены в Stage 2.2.
- **Клиенты оптовика** — отдельная таблица `customers`, якорь `tg_user_id`. Не являются пользователями системы (нет в `users`). Взаимодействуют только через Telegram customer-bot (Stage 3).
- **Авторизация:** JWT в cookie `session`. Проверка — в `src/lib/auth/session.ts`: не заблокирован + совпадает `session_epoch`.
- **RLS:** включён на всех пользовательских таблицах. Helper-функции `public.is_owner()`, `public.is_shipper()`, `public.is_admin()` — `SECURITY DEFINER`, чтобы не вызывать рекурсию через RLS на `users`.

### Иерархия RLS-ролей

| Функция        | Возвращает TRUE для         |
| -------------- | --------------------------- |
| `is_admin()`   | `admin`                     |
| `is_owner()`   | `owner`, `admin`            |
| `is_shipper()` | `shipper`, `owner`, `admin` |

Это значит одна `is_shipper()`-политика покрывает и отправщика, и владельца, и админа.
>>>>>>> origin/owner

---

## Таблицы

### `users`

Все авторизованные пользователи системы.

| Колонка                  | Тип         | Назначение                                        |
| ------------------------ | ----------- | ------------------------------------------------- |
| `id`                     | uuid PK     | Идентификатор                                     |
| `role`                   | text        | `owner` / `shipper` / `admin` (CHECK-ограничение) |
| `telegram_id`            | bigint      | TG-id для авторизации                             |
| `telegram_username`      | varchar     | Отображаемое имя в TG                             |
| `name`                   | varchar     | Отображаемое имя в UI                             |
| `avatar_url`             | text        | Аватар (бренд-витрина — в `business_settings`)    |
| `site_key`               | varchar(64) | Токен для неявной авторизации (storefront)        |
| `is_blocked`             | boolean     | Для блокировки доступа                            |
| `session_epoch`          | int         | Инкрементируется для принудительного logout       |
| `shipper_score`          | numeric     | ELO отправщика (считается ежедневно)              |
| `shipper_rate`           | numeric     | Индивидуальная ставка отправщика                  |
| `shipper_payment_mode`   | text        | `fixed` / `dynamic` / `pendulum`                  |
| `avito_client_id/secret` | text        | Avito-интеграция (Этап 9)                         |
| `avito_account_limit`    | int         | Avito-интеграция (Этап 9)                         |
| `created_at/updated_at`  | timestamptz | Аудит                                             |

**RLS:**

- `users_select` — `id = auth.uid() OR is_owner()`
- `users_update_self` — `id = auth.uid()`
- `users_update_owner` — `is_owner()`
- `users_insert_owner` — `is_owner()`

### `products`

Каталог товаров. Поле `seller_id` удалено в Stage 1 (моно-бизнес).

Ключевые колонки: `name`, `brand`, `category`, `purchase_price`, `drop_price`, `is_active`, `is_in_stock`, `is_premium`, `photo_urls[]`, `photo_main_index`, `deleted_at`.

**RLS:**

- `products_select` — `is_shipper()` (восстановлена в Stage 1.5; покрывает owner/admin/shipper)
- `products_modify_owner` — `is_owner()` FOR ALL

### `product_sizes`

Размеры товаров с количеством.

Ключевые колонки: `product_id`, `size`, `initial_quantity`, `current_quantity`.

**RLS:**

- `product_sizes_select` — `is_shipper()` (восстановлена в Stage 1.5)
- `product_sizes_modify_owner` — `is_owner()` FOR ALL (восстановлена в Stage 1.5)

### `orders`

Заказы. Поля `seller_id`, `fee_pct_snapshot`, `platform_fee_amount`, `seller_net_amount`, `yookassa_*` удалены в Stage 1. `client_id` (NOT NULL, FK → users) сохранён до Stage 2, где переедет в `customers`.

Ключевые колонки: `client_id`, `product_id`, `product_size_id`, `status`, `purchase_price`, `client_price`, `delivery_service`, `delivery_deadline`, `shipped_by`, `shipper_rate_snapshot`, `tracking_number`, `is_paid`, `paid_at`, `status_history` (jsonb), `trash_at`, `trash_deadline`, `completed_at`.

Статусы: `pending_payment`, `awaiting_shipment`, `collecting`, `in_transit`, `completed`, `return_in_transit`, `return_arrived`, `return_completed`, `cancelled`, `problem`, `trash`, `disposed`.

**RLS (восстановлена в Stage 1.5):**

- `orders_select` — `is_owner() OR (is_shipper() AND status IN (awaiting_shipment, collecting, in_transit, return_in_transit, return_arrived))`
- `orders_insert` — `client_id = auth.uid() OR is_owner()`
- `orders_update_owner` — `is_owner()`
- `orders_update_shipper` — `is_shipper() AND status IN (awaiting_shipment, collecting, return_arrived)`

### `shipper_ledger_entries`

Проводки начислений отправщику. Упрощена в Stage 1 (убран `seller_id`).

Ключевые колонки: `shipper_id`, `order_id` (может быть NULL для `debit_payout`), `kind` (`credit` / `debit_payout`), `amount`, `ref_payout_id`.

Уникальный индекс: `(order_id, kind)` WHERE `kind = 'credit'` — защита от дублей.

**RLS:**

- `shipper_ledger_select_own` — `shipper_id = auth.uid()`
- `shipper_ledger_select_owner` — `is_owner()`

### `shipper_payout_periods`

Периодические выплаты. В Stage 1 упрощена (убран `seller_id`, unique по `(shipper_id, period_start, period_end)`).

Ключевые колонки: `shipper_id`, `period_start`, `period_end`, `total_amount`, `orders_count`, `status` (`pending` / `paid` / `cancelled`), `paid_at`, `paid_by`, `note`.

**RLS:**

- `shipper_payout_periods_select_own` — `shipper_id = auth.uid()`
- `shipper_payout_periods_select_owner` — `is_owner()`

### `settings` (singleton)

Настройки бизнеса. В Stage 1/1.5 удалены `platform_commission_pct`, `referral_*`.

Оставшиеся поля: `first_order_discount`, `reservation_timeout_minutes`, `return_to_trash_days`, `trash_to_disposed_days`, `shipper_rate`, `shipper_fixed_rate`, `shipper_payment_mode`, `shipper_penalty_rate`, `pendulum_*`, `min_work_days`, `stats_window_days`, `daily_goal_bonus`, `streak_multiplier_*`, `streak_keep_threshold`, `monthly_profit_target`, `owner_telegram_username`, `support_telegram_username`, `default_location_city`, `payout_cadence`, `payout_weekday`, `payout_reserve_days`.

**RLS:**

- `settings_select_all` — `TRUE` (любой authenticated читает)
- `settings_modify_owner` — `is_owner()` FOR UPDATE

### `expenses`

Расходы бизнеса. `expenses_owner_only` FOR ALL.

### `payments`

Исторические платежи. Сохраняется для аудита. Новая модель оплаты (ручные чеки) появится в Stage 2.

### `size_reservations`

Временные резервирования размеров при оформлении заказа.

**RLS:**

- `size_reservations_select` — `user_id = auth.uid() OR is_owner()`
- `size_reservations_insert` — `user_id = auth.uid()`
- `size_reservations_delete` — `user_id = auth.uid() OR is_owner()`

### `suppliers`, `pickup_points`, `expenses`, `activity_log`, `notifications`, `user_fingerprints`, `fraud_alerts`

Служебные. `owner_only` RLS.

### `shipper_stats`, `shipper_payouts`

Устаревший простой лог выплат + ELO-метрики. Новая модель — через `shipper_ledger_entries` + `shipper_payout_periods`. Старые таблицы остаются до Этапа 7.

### `product_notifications`, `favorites`

Подписки клиента на поступление, избранное. Перейдут в `customers` в Stage 2.

---

## Триггеры

| Триггер                                 | Таблица                        | Назначение                                     |
| --------------------------------------- | ------------------------------ | ---------------------------------------------- |
| `update_updated_at`                     | users/products/orders/settings | Автообновление `updated_at`                    |
| `trigger_product_arrival`               | products                       | Уведомление подписчиков при `is_in_stock=true` |
| `trigger_update_quantity`               | orders                         | Возврат размера в склад при отмене/возврате    |
| `trigger_generate_site_key`             | users                          | Генерация `site_key` при INSERT                |
| `shipper_ledger_on_order_status_change` | orders                         | Credit-запись отправщику при `completed`       |

Удалены в Stage 1 / 1.5: `trigger_generate_referral_code`, `trigger_update_order_count`, `trigger_calculate_level`, `orders_set_seller_id`, `ledger_on_order_status_change` (seller-ledger), `orders_fee_snapshot`.

---

## Таблица: avito_proxies

```sql
CREATE TABLE avito_proxies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_url   TEXT NOT NULL UNIQUE,          -- http://user:pass@host:port
  is_active   BOOLEAN NOT NULL DEFAULT true, -- false = прокси отключен/мёртв
  assigned_to UUID REFERENCES avito_browser_sessions(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы для быстрого поиска свободных прокси
CREATE INDEX avito_proxies_assigned_to_idx ON avito_proxies(assigned_to);
CREATE INDEX avito_proxies_free_idx ON avito_proxies(is_active, assigned_to)
  WHERE is_active = true AND assigned_to IS NULL;
```

**Правила:**
- Один прокси = один Avito аккаунт (навсегда)
- Прокси НЕ освобождается при отключении аккаунта
- Без свободного прокси подключение отклоняется (409)
- `claim_avito_proxy` — атомарный захват с `FOR UPDATE SKIP LOCKED`

---

## Таблица: avito_browser_sessions

```sql
CREATE TABLE avito_browser_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id),
  account_index        INT NOT NULL DEFAULT 1,      -- 1-3 (по подписке)
  avito_login          TEXT,                         -- телефон/email
  avito_password_enc   TEXT,                         -- AES-256-GCM (per-user HKDF)
  avito_client_id      TEXT,                         -- OAuth (legacy, не используется для парсинга)
  avito_client_secret  TEXT,
  avito_user_id        BIGINT,
  cookies              JSONB DEFAULT '[]',           -- cookies из Puppeteer
  user_agent           TEXT,
  browser_fingerprint  JSONB,                        -- BrowserFingerprint (canvas, webgl, etc.)
  proxy_url            TEXT,                          -- привязанный прокси
  status               TEXT DEFAULT 'pending',       -- pending|awaiting_sms|active|expired|error
  sms_code             TEXT,                          -- временный SMS код
  error_message        TEXT,
  last_login_at        TIMESTAMPTZ,
  last_sync_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, account_index)
);
```

---

## RPC-функции

<<<<<<< HEAD
```sql
-- Атомарный захват свободного прокси из пула
CREATE OR REPLACE FUNCTION claim_avito_proxy(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_proxy_url TEXT;
BEGIN
  UPDATE avito_proxies
  SET assigned_to = p_user_id, updated_at = now()
  WHERE id = (
    SELECT id FROM avito_proxies
    WHERE is_active = true AND assigned_to IS NULL
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING proxy_url INTO v_proxy_url;
  RETURN v_proxy_url; -- NULL если свободных нет
END;
$$;

-- Атомарный инкремент reserved_quantity (для резервирования)
CREATE OR REPLACE FUNCTION increment_reserved_quantity(
  target_size_id UUID DEFAULT NULL,
  target_product_id UUID DEFAULT NULL
) RETURNS VOID AS $$
-- Увеличивает reserved_quantity на 1 для product_sizes или products
$$ LANGUAGE plpgsql SECURITY DEFINER;
=======
### Shipper payouts
>>>>>>> origin/owner

- `build_shipper_payouts_for_period(p_period_start DATE, p_period_end DATE)` — собирает `credit`-проводки в периоды, возвращает `(out_shipper_id, out_payout_id, out_amount)`. Stage 1.5 убрал `out_seller_id` из сигнатуры.
- `mark_shipper_payout_paid(p_payout_id, p_paid_by, p_note)` — атомарно переводит период в `paid`, создаёт одну `debit_payout` запись.
- `cancel_shipper_payout(p_payout_id)` — отменяет period, отвязывает `ref_payout_id` у credit-проводок.

### Orders / products

- `create_product_with_sizes(p_product jsonb, p_sizes jsonb[])` — атомарный INSERT продукта со списком размеров.
- `cancel_order_auto(order_id, reason)` — атомарная отмена с возвратом размера.
- `decrement_reserved_quantity(size_id, amount)` — для системы резервирования.
- `increment_session_epoch(user_id)` — force-logout.

### Служебные

- `update_shipper_scores()` — пересчёт ELO отправщиков (ежедневный BullMQ-job).

### Удалены в Stage 1 / 1.5

`is_seller()`, `is_client()`, `is_premium_client()`, `mark_seller_payout_paid`, `cancel_seller_payout`, `build_seller_payouts_for_period`, `block_seller`, `unblock_seller`, `append_seller_activity`, `block_client_for_seller`, `unblock_client_for_seller`, `get_seller_activity_log`, `get_seller_activity_recent_count`, `increment_user_deposit`.

---

## Матрица RLS-доступа

| Таблица                      | owner    | shipper                                      | authenticated без роли |
| ---------------------------- | -------- | -------------------------------------------- | ---------------------- |
| `users`                      | R+W всех | R self, W self                               | R self, W self         |
| `products`                   | R+W      | R                                            | ничего                 |
| `product_sizes`              | R+W      | R                                            | ничего                 |
| `orders`                     | R+W      | R по допустимым статусам, W в части статусов | ничего                 |
| `shipper_ledger_entries`     | R        | R own                                        | ничего                 |
| `shipper_payout_periods`     | R        | R own                                        | ничего                 |
| `settings`                   | R+W      | R                                            | R                      |
| `size_reservations`          | R+W      | ничего                                       | R+W own                |
| `expenses/suppliers/fraud_*` | R+W      | ничего                                       | ничего                 |

Модификации из API идут через `service_role` (обходит RLS) — RLS тут гарантия корректности при переходе на authenticated-контекст в будущем.

---

## Миграционная цепочка

Все миграции — в `supabase/migrations/`, применяются в лексикографическом порядке.

Ключевые вехи:

- `20260111000001-000003` — базовая схема.
- `20260414..20260422` — эра мульти-селлеров.
- `20260423000001-000005` — Stage 1 пивота (удаление seller/client/referral инфраструктуры, упрощение shipper\_\*, `SECURITY DEFINER` на хелперы, очистка триггеров).
- `20260424000001-000005` — Stage 1.5: добавление `admin`-роли в CHECK, восстановление SELECT/MODIFY политик на `products`/`product_sizes`/`orders`, удаление `users.goals` и `settings.referral_*`, очистка orphan seller-RPC.
- `20260425000001-000016` — Stage 2: новая модель клиентов и настроек бизнеса (см. ниже).

---

## Stage 2 — новые сущности

### Таблицы

- **`business_settings`** — singleton (уникальный индекс на `ON ((true))`). Бренд, `vibe_credit_default_limit`, `vibe_receipt_confirm_threshold`, `payment_requisites_message` (шаблон с переменными `{{amount}}`, `{{order_numbers}}`, `{{card_label}}`, `{{deadline}}`), `licence_expires_at`. RLS: SELECT для owner+shipper, UPDATE только owner.
- **`customers`** — клиенты оптовика (дроперы). Якорь `tg_user_id`. Поля: `vibe_enabled`/`vibe_credit_limit_override` (+ВАЙБ-кредит), `is_frozen`/`frozen_at` (автозаморозка через триггер), `is_blocked`/`blocked_reason`, `notes`. Адреса клиентов НЕ храним — дропшиппинг. Двухуровневые цены отменены (мигр. 20260425000017) — все клиенты равны. RLS: owner-only.
- **`orders.customer_id`** — FK на `customers` (заменил `client_id`). Snapshot-поля `customer_name_snapshot`, `customer_tg_username_snapshot`, `pickup_point_label_snapshot`, `pickup_point_address_snapshot` + триггеры автозаполнения.
- **`vibe_payments` + `vibe_payment_orders`** — +ВАЙБ-платежи. M2M для групповой оплаты одним чеком. `receipt_*` поля для OpenAI-распознавания (Stage 3). View `customer_vibe_debt` считает долг on-demand; триггер `check_vibe_credit_freeze` на orders/vibe_payments автоматически проставляет `is_frozen`.
- **`payment_methods` + `payment_method_month_stats`** — ферма карт/СБП/ИП. `card_number_full` plaintext + триггер вычисляет `card_number_last4`. RPC `next_payment_method(amount)` выбирает активную карту с учётом месячного лимита (business_account в конец). Триггер `vibe_payments_bump_method_stats` инкрементит stats на INSERT.
- **`order_messages`** — история переписки по заказу в Telegram (summary/receipt/note/status_update, outbound/inbound). RLS: owner full, shipper SELECT только для заказов в активных статусах.
- **`customer_conversations`** — история диалогов клиента для AI-менеджера (Stage 6). RLS owner-only.
- **`data_imports`** — каркас CSV/XLSX-импорта (парсер и UI — Stage 8).
- **`shipper_pickup_points`** — per-shipper каталог ПВЗ по службам доставки. RLS: owner full, shipper FULL только для своих.

### Изменения в существующих таблицах

- **`users`** — удалены `shop_name`, `bio` (переехали в `business_settings`). CHECK на `role` сужен до `owner/shipper/admin`.
- **`products`** — колонка `measurements` удалена (переехала на `product_sizes`). Двухуровневая цена `drop_price_top` добавлена в Stage 2.5 и удалена в 2.8 (мигр. 017) — бизнес-решение отмены: одна цена для всех клиентов.
- **`product_sizes`** — добавлена `measurements JSONB` (замеры на уровне размера).
- **`fraud_alerts`** — `user_id` → `customer_id`; CHECK на `alert_type` переосмыслен под B2B: `rapid_orders`, `return_abuse`, `suspicious_cancellation`, `frequent_cancellation`, `high_debt`, `suspicious_address`.

### Views / RPC

- **View `customer_vibe_debt`** — текущий долг клиента (SUM неоплаченных открытых заказов).
- **View `customer_risk_profile`** — агрегированные метрики риска на клиента (return_rate_pct, cancel_rate_pct, current_debt, vibe_limit, open_alerts_count).
- **RPC `next_payment_method(amount)`** — ротация методов оплаты с учётом месячного лимита.
- **RPC `run_fraud_detectors()`** — прогон 4 детекторов (return_abuse, frequent_cancellation, rapid_orders, high_debt). Вызывается суточным BullMQ cron (04:00 МСК) + ручной запуск из `/owner/security`.

### Storage

- Private bucket `receipts` — чеки клиентов. Пишет customer-bot (service_role), читает owner через signed URL.

### Удалены в Stage 2

- RPC `increment_user_deposit` / `decrement_user_deposit` / `increment_referral_deposit` (users.deposit дропнут в Stage 1).
- Атомарные RPC `cancel_order_atomic`, `complete_order_atomic`, `return_order_atomic` (ссылались на client_id).
- Триггер `update_client_last_order` и одноимённые функции.
- Shim `src/lib/seller/guards.ts` + `src/lib/seller/rating.ts`.
- Компонент `stage2-placeholder.tsx`.

---

## Изменения Stage 3 (миграции 019-022)

### `20260425000019_orders_customer_delivery.sql`

- `orders.customer_delivery_city VARCHAR(120)` — город ПВЗ, вводит клиент в боте.
- `orders.customer_delivery_point_text TEXT` — адрес/код ПВЗ текстом.

### `20260425000020_vibe_required_amount.sql`

- `customers.required_payment_amount NUMERIC(12,2)` — сколько должен заплатить
  клиент чтобы разморозиться (NULL = весь долг). Устанавливается при ручной
  заморозке владельцем.
- `customers.frozen_reason TEXT` — `auto_limit_exceeded` / `owner_manual` /
  произвольный текст.
- Обновлён триггер `check_vibe_credit_freeze`: при автозаморозке пишет
  `frozen_reason='auto_limit_exceeded'`, при разморозке обнуляет required\_\*.

### `20260425000021_business_settings_topic_ids.sql`

- `business_settings.orders_topic_id`, `payments_topic_id`, `returns_topic_id`
  (BIGINT) — ID топиков супергруппы `TELEGRAM_ORDERS_GROUP_ID`. NULL =
  постинг отключён. Заполняется владельцем через Supabase Studio.

### `20260425000022_partners.sql`

- Таблица **`partners`** — поставщики чужих товаров.
  | Колонка | Тип | Назначение |
  | ------- | --- | ---------- |
  | `id` | uuid PK | — |
  | `name` | text | Имя партнёра |
  | `tg_username` | varchar(64) | @username в TG |
  | `tg_user_id` | bigint unique | Привязка к partner-bot (NULL = не привязан) |
  | `invite_token` | uuid unique | Deep-link `t.me/<bot>?start=<token>` |
  | `is_active` | boolean | Soft-delete |
  | `notes` | text | Заметка владельца |

- Колонки на `products`: `partner_id UUID` FK → `partners(id)`,
  `partner_commission NUMERIC(10,2)` — фикс-сумма комиссии владельцу за
  каждый заказ этого товара.
- Колонки на `orders`:
  - `partner_id` — FK → `partners(id)`, NULL = собственный.
  - `partner_commission_snapshot` — комиссия на момент создания заказа.
  - `partner_requisites_text` — реквизиты, присланные партнёром клиенту.
  - `partner_payment_received_at` — партнёр подтвердил получение денег.
  - `partner_commission_paid_at` — владелец получил комиссию.
- RLS: только owner (partner-bot ходит через service_role).

### `20260427000023_drop_payments_topic_id.sql`

- Drop `business_settings.payments_topic_id` — после рефакторинга 2026-04-27
  фото чеков постятся не в топик «Оплаты» супергруппы заказов, а в отдельную
  приватную группу «ЧЕКИ» (`TELEGRAM_RECEIPTS_GROUP_ID`, без топиков).
- Остаются: `orders_topic_id`, `returns_topic_id` (топики клиентской группы).

---

## Изменения Stage 3.12 — Dropshipper rework (миграции 024–025)

Решение владельца 2026-04-27 (после старта Stage 3 smoke): клиент в этом
проекте — **дропшиппер**. Покупает у нас оптом и перепродаёт на Авито
конечному покупателю. Авито Доставка автоматически создаёт отправление в
выбранной службе и выдаёт дропшипперу трек-номер. Адрес/город конечного
получателя в нашей системе **не хранится** — только трек.

### `20260427000024_dropshipper_flow.sql`

- DROP `orders.customer_delivery_city`, `orders.customer_delivery_point_text`
  (от миграции 019) — клиент больше не вводит город/ПВЗ.
- (⚠️ ошибочно создал `products.dispatch_city` и
  `business_settings.default_dispatch_city` — оказалось, эту функциональность
  уже выполняют существующие `products.location_city` и
  `settings.default_location_city`. Откатил миграцией 025.)

### `20260427000025_drop_dispatch_city_dupes.sql`

- DROP `products.dispatch_city`, `business_settings.default_dispatch_city`
  — откат ошибочной части миграции 024.

### Что используется в новом flow

- **`products.location_city`** (уже существовал, миграция 20260408000002) —
  город откуда отправляется конкретный товар. Заполняется при создании;
  владелец редактирует в `/owner/products/[id]`.
- **`settings.default_location_city`** (уже существовал) — базовый город,
  подставляется по дефолту в форму создания товара. Редактируется в
  `/owner/settings`.
- **`orders.delivery_service`** — служба доставки, выбранная клиентом
  (enum: `yandex` / `cdek` / `pochta` / `avito` / `5post`).
- **`orders.tracking_number`** — клиент сам вводит в wizard'е **до** оплаты
  (раньше заполнялся отправщиком при отгрузке).

### Wizard customer-bot (новый)

1. Каталог → товар → размер.
2. Бот показывает «📍 Отправляется из: <location_city>» — информативно.
3. Клиент выбирает службу доставки (5 опций).
4. Клиент вводит **трек-номер** текстом (от Авито Доставки/выбранной службы).
5. Оплата — реквизиты или +ВАЙБ-долг.

ПВЗ доставки клиента из системы убраны полностью. ПВЗ остаются только в
`shipper_pickup_points` — это точки **отправщика** для возвратов
(возврат приходит на ТОТ ЖЕ ПВЗ откуда отправляли).

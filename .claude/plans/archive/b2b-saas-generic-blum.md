# Stage 2 — Новая модель данных (B2B SaaS пивот)

## Context

Мы закрыли Stage 1 + 1.5 пивота с B2C-платформы на B2B SaaS-коробку для оптовиков одежды. Сейчас в базе:

- Seller-мультитенантность вырезана; осталось single-tenant.
- 5 страниц/API (`/owner/clients*`, `/owner/security`) показывают `Stage2Placeholder` — их удалили, а новую модель ещё не положили.
- 5 файлов со стигмой `@ts-nocheck` (~2160 строк), ссылаются на удалённые seller-сущности. Билд зелёный только потому что проверки отключены на этих файлах.
- `orders.client_id` всё ещё указывает на `users(id)` — legacy-модель «клиент = user».
- `users.role` CHECK допускает `'client'` / `'seller'` — они больше не пишутся, но CHECK открыт.

**Задача Stage 2** — положить новую модель данных, закрыть техдолг и восстановить три удалённые страницы под новую схему:

1. Отдельная таблица `customers` (клиенты оптовика = дроперы через Telegram), миграция `orders.client_id → orders.customer_id`. Адреса клиентов НЕ храним — дропшиппинг-модель, клиент не задаёт адрес.
2. `business_settings` (singleton: настройки бизнеса — замена/дополнение к `settings`).
3. +ВАЙБ-кредит: `vibe_payments` + `vibe_payment_orders` + view долга + триггер автозаморозки/авторазморозки.
4. Ферма платёжных карт: `payment_methods` с месячными лимитами + RPC-«следующая карта».
5. Telegram-переписка: `order_messages`, `customer_conversations`.
6. Каркас `data_imports` (парсер и UI — в Stage 8).
7. Замеры переносим с `products.measurements` на `product_sizes.measurements` (у каждого размера свои замеры).
8. Двухуровневые цены: `products.drop_price_top` (для «топовых» клиентов) + `customers.is_top BOOLEAN`. Fallback на обычную `drop_price` если у товара не задана top-цена.
9. Каркас ПВЗ-адресов отправщика: `shipper_pickup_points` (один отправщик — множество ПВЗ разных служб доставки) + `orders.pickup_point_id` с snapshot-полями. В Stage 2 — только схема, полный UI — в Stage 7.
10. Переписываем 5 `@ts-nocheck` файлов, удаляем shim `src/lib/seller/guards.ts`.
11. Восстанавливаем `/owner/clients`, `/owner/clients/[id]`, `/owner/security`. `/owner/security` — per-customer риск-панель с агрегированными метриками (возвраты, отмены, долг/лимит) + лента fraud-алертов. Мигрируем `fraud_alerts.user_id → customer_id`, переосмысливаем типы алертов под B2B, добавляем детекторы и суточный cron.
12. Не делаем `product_variants` — по бизнесу не нужно (фото/название/описание + размер с замерами достаточно).

Критический путь: Stage 2 → Stage 3 (customer-bot + заказ-флоу + manual payment) → дальше по roadmap.

---

## Бизнес-решения (подтверждены владельцем)

| Тема                        | Решение                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Лимит +ВАЙБ                 | Глобальный дефолт в `business_settings.vibe_credit_default_limit` + индивидуальное переопределение `customers.vibe_credit_limit_override`                                                                                                                                            |
| Заморозка                   | Автоматическая при превышении лимита (триггер на `orders`/`vibe_payments`). Авторазморозка при погашении долга под лимит                                                                                                                                                             |
| Замороженный клиент в боте  | Видит только функцию «оплатить долг» (реализация — Stage 3). На Stage 2 только флаг `is_frozen` и значения для логики                                                                                                                                                                |
| Групповая оплата            | Клиент выбирает набор неоплаченных заказов → бот считает сумму → шлёт реквизиты → клиент переводит → присылает чек → нейронка распознаёт → `vibe_payments` запись с `vibe_payment_orders` связями. Логика — Stage 3, схема — сейчас                                                  |
| Атрибуты товара             | Только фото/название/описание + размеры. Никаких цвета/длины. `product_variants` отменяем                                                                                                                                                                                            |
| Замеры                      | На каждый размер (`product_sizes.measurements JSONB`). Поддерживаем «One Size» через запись в `product_sizes` со значением `'one size'`                                                                                                                                              |
| Реквизиты                   | Ферма карт: `payment_methods` с месячным лимитом, автоматическая ротация (RPC `next_payment_method`), фоллбэк на ИП (`kind='business_account'`). Опциональный порог `vibe_receipt_confirm_threshold` для подтверждения крупных сумм                                                  |
| Отправка реквизитов клиенту | Автоматически ботом сразу после подтверждения заказа владельцем (логика — Stage 3)                                                                                                                                                                                                   |
| Импорт товаров              | Каркас таблицы `data_imports` сейчас, парсер + UI — в Stage 8                                                                                                                                                                                                                        |
| `/owner/security`           | Per-customer риск-панель: список подозрительных клиентов с агрегированными метриками (return rate, cancel rate, долг/лимит, rapid_orders) + активные fraud-алерты с типами под B2B. `fraud_alerts.user_id` мигрируем на `customer_id`. Блокировки клиентов — в `/owner/clients/[id]` |
| Долг +ВАЙБ                  | Считаем on-demand через view `customer_vibe_debt`, **не** денормализуем                                                                                                                                                                                                              |
| Номера карт                 | Храним открытым текстом в БД. Обоснование: single-tenant, доступ только у владельца через `is_owner()` RLS, app-level шифрование ключом из того же деплоя не даёт дополнительной защиты. UI маскирует до `last4`                                                                     |
| Уровни цен                  | Два уровня: обычные клиенты и «топы/свои». У товара `drop_price` (обычная) + `drop_price_top NUMERIC NULL` (для топов, NULL → fallback на drop_price). У клиента `is_top BOOLEAN DEFAULT FALSE`                                                                                      |
| Адреса клиентов             | Не храним. Дропшиппинг: дропер знает город товара из каталога, размещает на Авито в том же городе, возвраты Авито всегда приходят на ПВЗ отправителя                                                                                                                                 |
| Замеры тела клиента         | Не нужны в Stage 2. `customers.body_measurements` НЕ добавляем                                                                                                                                                                                                                       |
| Создание клиента            | Только через бот при `/start`. Ручное добавление в панели НЕ делаем. API — только GET/PATCH                                                                                                                                                                                          |
| Возврат и долг +ВАЙБ        | Сумма возвращённого заказа уходит из долга в момент `status='return_completed'`. Возврат в `return_in_transit`/`return_arrived` ещё считается в долге                                                                                                                                |
| Частичная оплата долга      | Нет. Только за выбранные клиентом заказы целиком                                                                                                                                                                                                                                     |
| Слияние клиентов            | Не кодим. Новый TG-аккаунт = новая запись. Если понадобится — SQL вручную                                                                                                                                                                                                            |
| Блокировка клиента          | Открытые заказы продолжаются без изменений. Блок влияет только на новые заказы (бот отказывает в оформлении)                                                                                                                                                                         |
| ПВЗ-адреса отправщика       | Таблица `shipper_pickup_points`: у каждого отправщика свой список ПВЗ по каждой службе доставки (`delivery_service` из CHECK на orders), можно архивировать. Удалённые/архивные остаются видны в старых заказах через snapshot-поля на orders. Полный UI — Stage 7, каркас — сейчас  |
| Шаблон реквизитов           | Текст в `business_settings.payment_requisites_message` с переменными: `{{amount}}`, `{{order_numbers}}`, `{{card_label}}`, `{{deadline}}`. Подстановка — в Stage 3 (customer-bot), в Stage 2 только поле и документация переменных                                                   |

---

## Карта фаз и миграций

| #   | Фаза                                                                                                                                                                                                   | Миграции                                                                                                   | Commit    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------- |
| 1   | `business_settings` + чистка `users.shop_name/bio`                                                                                                                                                     | `20260425000001`, `20260425000002`                                                                         | Stage 2.1 |
| 2   | `customers` + `orders.customer_id` + сужение `users.role` CHECK                                                                                                                                        | `20260425000003`, `20260425000004`, `20260425000005` (+ `000006` если найдутся осиротевшие триггеры)       | Stage 2.2 |
| 3   | +ВАЙБ-кредит: `vibe_payments` + view + триггер                                                                                                                                                         | `20260425000007`                                                                                           | Stage 2.3 |
| 4   | Ферма карт: `payment_methods` + RPC + storage-бакет                                                                                                                                                    | `20260425000008`, `20260425000009`                                                                         | Stage 2.4 |
| 5   | Telegram/imports/замеры/two-tier-цены/ПВЗ: `order_messages`, `customer_conversations`, `data_imports`, `product_sizes.measurements`, `products.drop_price_top`, `shipper_pickup_points` + FK на orders | `20260425000010`, `20260425000011`, `20260425000012`, `20260425000013`, `20260425000014`, `20260425000015` | Stage 2.5 |
| 6   | Безопасность клиентов: миграция `fraud_alerts` на `customer_id` + view `customer_risk_profile` + детекторы                                                                                             | `20260425000016`                                                                                           | Stage 2.6 |
| 7   | Рефакторинг 5 `@ts-nocheck` + новые API/страницы + удаление shim                                                                                                                                       | (без миграций)                                                                                             | Stage 2.7 |
| 8   | RLS-тесты + docs + финальная верификация                                                                                                                                                               | (без миграций)                                                                                             | Stage 2.8 |

Итого: **16 новых миграций**, все с префиксом `20260425*`, поверх существующей цепочки `20260424*`.

---

## Фаза 1 — `business_settings` + чистка `users`

### Миграция `20260425000001_business_settings.sql`

Создаёт singleton-таблицу `business_settings` с полями:

- `id UUID PK`, UNIQUE-индекс-синглтон `ON ((true))`
- `business_name`, `business_bio TEXT`
- `vibe_credit_default_limit NUMERIC(12,2) DEFAULT 0`
- `vibe_receipt_confirm_threshold NUMERIC(12,2) NULL` (NULL = никогда не требовать ручное подтверждение)
- `payment_requisites_message TEXT` — шаблон сообщения с реквизитами
- `licence_expires_at TIMESTAMPTZ` — хук на биллинг-трек (см. CLAUDE.md)
- `updated_at TIMESTAMPTZ`

Бэкфилл: `INSERT` одной строки, `business_name` берём из первого `users.shop_name WHERE role='owner'`.

RLS:

- `SELECT` — `is_owner() OR is_shipper()` (shipper видит `business_name` для шапки PWA).
- `UPDATE` — `is_owner()`.
- `INSERT`/`DELETE` — запрет (singleton).

### Миграция `20260425000002_drop_users_shop_name_bio.sql`

Порядок: **сначала правим код**, **потом дропаем колонки** (иначе сломается билд).

Код-правки (перед миграцией):

- [src/app/api/owner/profile/route.ts](src/app/api/owner/profile/route.ts) — читать/писать `shop_name`/`bio` через `business_settings.business_name`/`business_bio`.
- [src/app/api/owner/settings/route.ts](src/app/api/owner/settings/route.ts) — расширить Zod-схему полями `vibeCreditDefaultLimit`, `vibeReceiptConfirmThreshold`, `paymentRequisitesMessage`. GET объединяет `settings + business_settings`, PATCH маршрутизирует по таблице через `fieldMap`.

Миграция: `ALTER TABLE users DROP COLUMN shop_name, DROP COLUMN bio;`

**Решение:** НЕ создаём отдельный `/api/owner/business-settings` — расширяем существующий `/api/owner/settings`. В UI это единый экран; два роута избыточны.

### Верификация фазы 1

```bash
npm run db:migrate && npm run db:gen-types && npx tsc --noEmit && npm run build && npm run test:rls
```

### Оценка: 3–4 часа

---

## Фаза 2 — `customers` + миграция `orders.client_id → customer_id`

### Миграция `20260425000003_create_customers.sql`

```sql
CREATE TABLE customers (
  id UUID PK DEFAULT gen_random_uuid(),
  tg_user_id BIGINT UNIQUE NOT NULL,
  telegram_username VARCHAR(64),
  name VARCHAR(255),
  phone VARCHAR(32),
  is_top BOOLEAN DEFAULT FALSE,              -- ценовой уровень: TRUE → drop_price_top
  vibe_enabled BOOLEAN DEFAULT FALSE,
  vibe_credit_limit_override NUMERIC(12,2),  -- NULL → дефолт из business_settings
  is_frozen BOOLEAN DEFAULT FALSE,
  frozen_at TIMESTAMPTZ,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  notes TEXT,
  created_at, updated_at TIMESTAMPTZ
);
```

Адреса и замеры тела намеренно **не включены**: дропшиппинг-модель (см. бизнес-решения).

Индексы: `tg_user_id`, partial на `is_frozen`, `is_blocked`, `vibe_enabled`, `is_top`.

RLS: `SELECT`/`ALL` только `is_owner()`. Customer-bot работает под `service_role` и обходит RLS.

### Миграция `20260425000004_orders_customer_id.sql`

**Атомарная одношаговая миграция** (продовых заказов клиентов нет, только legacy-фикстура в `tests/rls/fixtures.ts`):

1. `DELETE FROM orders WHERE client_id IN (SELECT id FROM users WHERE role='client')` — чистим тестовые placeholder-заказы.
2. `DROP CONSTRAINT orders_client_id_fkey CASCADE`, `DROP COLUMN client_id CASCADE`.
3. `ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL`.
4. `ADD COLUMN customer_name_snapshot VARCHAR(255), customer_tg_username_snapshot VARCHAR(64)` — денормализация для shipper-этикеток (shipper не видит `customers`, но заказы должны рендериться без JOIN).
5. Индекс `idx_orders_customer ON orders(customer_id)`.
6. Триггер `BEFORE INSERT OR UPDATE OF customer_id` автозаполняет snapshot-поля из `customers`.

### Миграция `20260425000005_users_role_check_tighten.sql`

```sql
DELETE FROM users WHERE role IN ('client', 'seller');  -- должно быть 0 после 000004
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','shipper','admin'));
```

### Код-правки фазы 2

Обновить все места, где код читает `orders.client_id` или JOIN'ит `users!orders_client_id_fkey`:

- [src/app/api/shipper/orders/route.ts](src/app/api/shipper/orders/route.ts), [src/app/api/shipper/orders/[id]/route.ts](src/app/api/shipper/orders/%5Bid%5D/route.ts), [src/app/api/shipper/orders/batch/route.ts](src/app/api/shipper/orders/batch/route.ts) — читать snapshot-поля напрямую из orders.
- [src/app/api/owner/orders/[id]/route.ts](src/app/api/owner/orders/%5Bid%5D/route.ts) — JOIN на `customers`.
- [src/app/api/owner/orders/export/route.ts](src/app/api/owner/orders/export/route.ts) — то же.
- [src/app/api/owner/orders/batch/route.ts](src/app/api/owner/orders/batch/route.ts) — уведомления клиенту убираем (переедут в customer-bot на Stage 3).

Типы:

- [src/types/database.ts](src/types/database.ts): `OrderWithDetails.client: User` → `customer: Customer | null`, добавить `export type Customer = TablesType<"customers">`.

Фикстуры:

- [tests/rls/fixtures.ts](tests/rls/fixtures.ts) — убрать `legacyClient` (user с `role='client'`), добавить вставку в `customers`, привязать заказ на `customer_id`.

### Миграция `20260425000006_fix_triggers_after_customer.sql` (условно)

Прогон: `grep "client_id\|users" supabase/migrations/*.sql | grep -v "//"` на предмет осиротевших триггеров/функций. Если найдутся — в этой миграции DROP или refactor.

### Верификация фазы 2

```bash
npm run db:migrate && npm run db:gen-types && npx tsc --noEmit && npm run build && npm run test:rls && npm run test:e2e
```

### Оценка: 5–6 часов

---

## Фаза 3 — +ВАЙБ-кредит

### Миграция `20260425000007_vibe_payments.sql`

Две таблицы:

```sql
CREATE TABLE vibe_payments (
  id UUID PK,
  customer_id UUID NOT NULL REFERENCES customers ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  receipt_file_url TEXT,                 -- signed URL на Supabase Storage
  receipt_recognized_text TEXT,          -- распознанный OpenAI-ом текст
  receipt_raw_response JSONB,            -- сырой ответ OpenAI для аудита
  payment_method_id UUID,                -- FK добавим в Фазе 4
  received_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_by UUID REFERENCES users,    -- NULL = автоподтверждение, иначе owner
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

CREATE TABLE vibe_payment_orders (
  vibe_payment_id UUID REFERENCES vibe_payments ON DELETE CASCADE,
  order_id UUID REFERENCES orders ON DELETE RESTRICT,
  PRIMARY KEY (vibe_payment_id, order_id)
);
```

View текущего долга:

```sql
CREATE VIEW customer_vibe_debt AS
SELECT c.id AS customer_id,
       COALESCE(SUM(o.client_price), 0)::NUMERIC(12,2) AS debt
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.id
  AND o.is_paid = FALSE
  AND o.status NOT IN ('cancelled','disposed','trash','return_completed')
GROUP BY c.id;
```

Триггер `check_vibe_credit_freeze()` на `orders` (AFTER INSERT/UPDATE OF is_paid, status, client_price / DELETE) и на `vibe_payments` (AFTER INSERT/DELETE): считает debt из view, сравнивает с `COALESCE(vibe_credit_limit_override, business_settings.vibe_credit_default_limit)`, обновляет `customers.is_frozen` и `frozen_at`.

RLS: owner-only на обе таблицы. Customer-bot — через service_role.

**BullMQ:** `auto-freeze-check` cron НЕ добавляем — БД-триггер покрывает все события.

### Код фазы 3

- Типы в [src/types/database.ts](src/types/database.ts).
- API для `vibe_payments` создаём в Фазе 6 (как часть клиентского UI).

### Оценка: 4–5 часов

---

## Фаза 4 — Платёжные методы (ферма карт)

### Миграция `20260425000008_payment_methods.sql`

```sql
CREATE TABLE payment_methods (
  id UUID PK,
  kind TEXT CHECK (kind IN ('card','sbp','business_account')),
  label VARCHAR(100) NOT NULL,           -- "Тинькофф Лена", "ИП Сидоров"
  card_number_full VARCHAR(19),          -- для card, plaintext (обоснование в Context)
  card_number_last4 VARCHAR(4),          -- вычисляется триггером
  holder_name VARCHAR(255),
  bank_name VARCHAR(100),
  sbp_phone VARCHAR(32),                 -- для sbp
  business_requisites JSONB,             -- для business_account (ИНН, КПП, р/с, БИК)
  monthly_limit NUMERIC(12,2),           -- NULL = без лимита
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at, updated_at
);

CREATE TABLE payment_method_month_stats (
  payment_method_id UUID REFERENCES payment_methods ON DELETE CASCADE,
  year_month CHAR(7),                    -- '2026-04'
  amount_used NUMERIC(12,2) DEFAULT 0,
  PRIMARY KEY (payment_method_id, year_month)
);
```

Триггер `BEFORE INSERT/UPDATE OF card_number_full` вычисляет `card_number_last4` (последние 4 цифры, игнорируя пробелы/дефисы).

FK из Фазы 3: `ALTER TABLE vibe_payments ADD CONSTRAINT … FOREIGN KEY (payment_method_id) REFERENCES payment_methods ON DELETE SET NULL`.

RPC `next_payment_method(p_amount NUMERIC) RETURNS payment_methods`:

- SELECT active methods WHERE `monthly_limit IS NULL OR amount_used + p_amount <= monthly_limit`.
- ORDER BY `kind='business_account'` в конец, потом `sort_order ASC, id ASC`.
- LIMIT 1. SECURITY DEFINER, STABLE.

Триггер `AFTER INSERT ON vibe_payments` инкрементит `payment_method_month_stats` (UPSERT).

RLS: owner-only + `REVOKE SELECT FROM anon`.

### Миграция `20260425000009_receipts_bucket.sql`

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts','receipts',false) ON CONFLICT DO NOTHING;
-- Политики: только service_role INSERT/SELECT (бот пишет, API генерирует signed URL для владельца)
```

### Код фазы 4

- `POST/GET/PATCH/DELETE /api/owner/payment-methods/…` — новый CRUD.
- `GET /api/owner/payment-methods/[id]/stats` — текущий `amount_used` за месяц.
- UI: таб «Платёжные методы» внутри `/owner/settings` (URL `/owner/settings?tab=payments`). Не создаём отдельную страницу.

### Оценка: 3–4 часа

---

## Фаза 5 — Telegram + imports + замеры + two-tier цены + ПВЗ-каркас

### Миграция `20260425000010_order_messages.sql`

```sql
CREATE TABLE order_messages (
  id UUID PK,
  order_id UUID REFERENCES orders ON DELETE CASCADE,
  tg_chat_id BIGINT NOT NULL,
  tg_message_id BIGINT NOT NULL,
  tg_thread_id BIGINT,                   -- топик «заказы» в супергруппе
  kind TEXT CHECK (kind IN ('summary','receipt','note','status_update')),
  direction TEXT CHECK (direction IN ('outbound','inbound')),
  body TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  UNIQUE (tg_chat_id, tg_message_id)
);
```

RLS: owner full, shipper SELECT по заказам в активных статусах (`awaiting_shipment, collecting, in_transit, return_in_transit, return_arrived`).

### Миграция `20260425000011_customer_conversations.sql`

```sql
CREATE TABLE customer_conversations (
  id UUID PK,
  customer_id UUID REFERENCES customers ON DELETE CASCADE,
  tg_chat_id BIGINT NOT NULL,
  role TEXT CHECK (role IN ('user','assistant','human_owner')),
  content TEXT NOT NULL,
  metadata JSONB,                        -- {tokens, model, tool_calls, ...}
  created_at TIMESTAMPTZ
);
```

RLS: owner-only.

### Миграция `20260425000012_data_imports.sql`

```sql
CREATE TABLE data_imports (
  id UUID PK,
  kind TEXT CHECK (kind IN ('products','customers','orders')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','processing','completed','failed','cancelled')),
  source_file_url TEXT,
  source_format TEXT CHECK (source_format IN ('xlsx','csv','json','google_sheets')),
  total_rows, processed_rows, success_rows, failed_rows INT,
  error_log JSONB,
  started_at, completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users,
  created_at TIMESTAMPTZ
);
```

Каркас без UI/парсера (Stage 8). RLS: owner-only. FK-колонки на `products.import_id`/`customers.import_id` — в Stage 8.

### Миграция `20260425000013_product_sizes_measurements.sql`

Переносим замеры с товара на размер:

```sql
ALTER TABLE product_sizes ADD COLUMN measurements JSONB;
UPDATE product_sizes ps
  SET measurements = p.measurements
  FROM products p
  WHERE ps.product_id = p.id AND p.measurements IS NOT NULL;
ALTER TABLE products DROP COLUMN measurements;
```

**Перед дропом:** grep по коду на `products.measurements` / `product.measurements` — обновить все места на `product_sizes[].measurements`. В UI это форма размеров (на каждой строке размера — поле «замеры»).

### Миграция `20260425000014_two_tier_prices.sql`

```sql
ALTER TABLE products ADD COLUMN drop_price_top NUMERIC(12,2);
-- customers.is_top уже добавлено в 20260425000003.
COMMENT ON COLUMN products.drop_price_top IS
  'Цена для клиентов с is_top=TRUE. NULL → fallback на drop_price.';
```

Логика в коде оформления заказа (Stage 3 / текущий `src/utils/pricing.ts`):

```
clientPrice = customer.is_top && product.drop_price_top !== null
  ? product.drop_price_top
  : product.drop_price;
```

UI в `/owner/products/[id]`: рядом с полем «Оптовая цена» — поле «Цена для топов» (опциональное). В `/owner/clients/[id]` — переключатель `is_top`.

### Миграция `20260425000015_shipper_pickup_points.sql`

```sql
CREATE TABLE shipper_pickup_points (
  id UUID PK DEFAULT gen_random_uuid(),
  shipper_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_service TEXT NOT NULL CHECK (delivery_service IN
    ('avito','yandex','cdek','pochta','boxberry','5post')),
  label VARCHAR(100) NOT NULL,                 -- "ПВЗ ул. Ленина 5"
  address_text TEXT NOT NULL,                  -- полный адрес
  code VARCHAR(50),                            -- код ПВЗ у провайдера (опционально, для API)
  is_archived BOOLEAN DEFAULT FALSE,
  created_at, updated_at TIMESTAMPTZ
);

CREATE INDEX idx_shipper_pickup_points_shipper ON shipper_pickup_points(shipper_id);
CREATE INDEX idx_shipper_pickup_points_active
  ON shipper_pickup_points(shipper_id, delivery_service) WHERE is_archived = FALSE;

-- RLS
ALTER TABLE shipper_pickup_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY pickup_points_owner_all ON shipper_pickup_points
  FOR ALL TO authenticated
  USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY pickup_points_shipper_own ON shipper_pickup_points
  FOR ALL TO authenticated
  USING (is_shipper() AND shipper_id = auth.uid())
  WITH CHECK (is_shipper() AND shipper_id = auth.uid());

-- FK + snapshot на orders
ALTER TABLE orders ADD COLUMN pickup_point_id UUID
  REFERENCES shipper_pickup_points(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN pickup_point_label_snapshot VARCHAR(100);
ALTER TABLE orders ADD COLUMN pickup_point_address_snapshot TEXT;

CREATE INDEX idx_orders_pickup_point ON orders(pickup_point_id);

-- Триггер snapshot
CREATE OR REPLACE FUNCTION orders_snapshot_pickup_point() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pickup_point_id IS NOT NULL THEN
    SELECT label, address_text
      INTO NEW.pickup_point_label_snapshot, NEW.pickup_point_address_snapshot
      FROM shipper_pickup_points WHERE id = NEW.pickup_point_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_snapshot_pickup_point
  BEFORE INSERT OR UPDATE OF pickup_point_id ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_snapshot_pickup_point();
```

**Scope в Stage 2:** только схема. Полный UI (список ПВЗ в shipper-PWA, выбор при отправке, CRUD) — в Stage 7. В Stage 2 API добавляем минимальный `GET /api/shipper/pickup-points` (для возможной отладки), но основной UI — позже. Это каркас, не блокирующий Stage 3.

### Оценка: 3–4 часа

---

## Фаза 6 — Безопасность клиентов (fraud_alerts + customer_risk_profile)

Страница `/owner/security` становится per-customer риск-панелью, а не просто лентой алертов. Для этого:

1. Мигрируем `fraud_alerts.user_id → customer_id` (раньше ссылалась на `users`, теперь — на `customers`).
2. Переосмысливаем типы алертов под B2B: убираем `self_referral`, `deposit_abuse`, `duplicate_fingerprint` (реферальная программа и депозиты вырезаны). Оставляем `rapid_orders`, `return_abuse`, `suspicious_cancellation`. Добавляем `high_debt` (долг близко к лимиту +ВАЙБ), `frequent_cancellation` (отличается от suspicious_cancellation: просто много отмен без явных признаков фрода), `suspicious_address` (несколько клиентов с одним адресом — зачаток, детектор в Stage 6).
3. Заводим view `customer_risk_profile` — агрегированные метрики по клиенту.
4. Базовые детекторы как PL/pgSQL функции, вызываемые из BullMQ-cron раз в сутки (`run-fraud-detectors`).

### Миграция `20260425000016_fraud_alerts_customer_migration.sql`

```sql
-- 1. Чистим осиротевшие записи (user_id ссылается на удалённых role='client')
DELETE FROM fraud_alerts WHERE user_id NOT IN (SELECT id FROM users);

-- 2. Добавляем customer_id
ALTER TABLE fraud_alerts ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;

-- 3. Бэкфилл не нужен (в тестовой среде fraud_alerts пустая или с осиротевшими).
--    Если на проде когда-то появятся — их user_id уже не связан с новой customers.

-- 4. Дропаем старую колонку
ALTER TABLE fraud_alerts DROP COLUMN user_id;

-- 5. Переопределяем CHECK на alert_type под B2B
ALTER TABLE fraud_alerts DROP CONSTRAINT fraud_alerts_alert_type_check;
ALTER TABLE fraud_alerts ADD CONSTRAINT fraud_alerts_alert_type_check CHECK (alert_type IN (
  'rapid_orders',             -- >=5 заказов за час
  'return_abuse',             -- return_rate > 50% при >=3 заказах
  'suspicious_cancellation',  -- заказ отменён сразу после создания с подозрительным паттерном
  'frequent_cancellation',    -- cancel_rate > 70% при >=5 заказах
  'high_debt',                -- долг >= 90% лимита +ВАЙБ
  'suspicious_address'        -- один адрес у нескольких клиентов
));

-- 6. Индекс и обновление RLS
CREATE INDEX idx_fraud_alerts_customer ON fraud_alerts(customer_id);
CREATE INDEX idx_fraud_alerts_open ON fraud_alerts(status) WHERE status = 'open';

-- RLS уже owner-only через политику fraud_alerts_owner_only (миграция 20260111000003).
-- Политика переиспользует is_owner() — дополнительных правок не требуется.
```

### View `customer_risk_profile`

```sql
CREATE OR REPLACE VIEW customer_risk_profile AS
SELECT
  c.id AS customer_id,
  c.name,
  c.telegram_username,
  c.is_frozen,
  c.is_blocked,
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status LIKE 'return_%') AS return_count,
  COUNT(o.id) FILTER (WHERE o.status = 'cancelled') AS cancel_count,
  COALESCE(ROUND(100.0 * COUNT(o.id) FILTER (WHERE o.status LIKE 'return_%')
    / NULLIF(COUNT(o.id), 0), 1), 0) AS return_rate_pct,
  COALESCE(ROUND(100.0 * COUNT(o.id) FILTER (WHERE o.status = 'cancelled')
    / NULLIF(COUNT(o.id), 0), 1), 0) AS cancel_rate_pct,
  COALESCE(vd.debt, 0) AS current_debt,
  COALESCE(c.vibe_credit_limit_override,
    (SELECT vibe_credit_default_limit FROM business_settings LIMIT 1)) AS vibe_limit,
  MAX(o.created_at) AS last_order_at,
  (SELECT COUNT(*) FROM fraud_alerts f WHERE f.customer_id = c.id AND f.status = 'open') AS open_alerts_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
LEFT JOIN customer_vibe_debt vd ON vd.customer_id = c.id
GROUP BY c.id, vd.debt;

GRANT SELECT ON customer_risk_profile TO authenticated;
```

### Детекторы (PL/pgSQL функции)

Оформляем в той же миграции как `SECURITY DEFINER` функции, которые вставляют алерты:

- `detect_high_return_rate()` — вставляет алерт `return_abuse` для клиентов с `return_rate_pct > 50` AND `total_orders >= 3`, ещё не имеющих открытого такого же алерта.
- `detect_frequent_cancellation()` — вставляет `frequent_cancellation` для `cancel_rate_pct > 70` AND `total_orders >= 5`.
- `detect_rapid_orders()` — вставляет `rapid_orders` для клиентов, создавших >=5 заказов за час.
- `detect_high_debt()` — вставляет `high_debt` для клиентов с `current_debt >= 0.9 * vibe_limit` AND `vibe_enabled = TRUE`.

Обёртка `run_fraud_detectors()` вызывает все четыре. Все функции идемпотентны: не создают дубль, если алерт того же типа уже `status = 'open'` у клиента.

`detect_suspicious_cancellation()` и `detect_suspicious_address()` — заглушки на будущее (Stage 6 AI-менеджер + поведенческая аналитика). Оставляем CHECK, чтобы алерт можно было создать вручную.

### BullMQ-job `run-fraud-detectors`

В [src/lib/jobs/queues.ts](src/lib/jobs/queues.ts):

- `RunFraudDetectorsJobData = {}` (без payload, разовый запуск).
- Очередь `run-fraud-detectors`, воркер зовёт RPC `run_fraud_detectors()`.
- Cron: раз в сутки в 04:00 местного времени (добавить `scheduleDailyFraudDetectors()` в `scripts/worker.ts`).

### Верификация фазы 6

```bash
npm run db:migrate && npm run db:gen-types && npx tsc --noEmit && npm run build
```

- Ручная проверка: вставь клиента с 5 заказами, из которых 4 cancelled → `customer_risk_profile.cancel_rate_pct = 80` → `SELECT run_fraud_detectors()` → появился `fraud_alerts` с `alert_type='frequent_cancellation'`.

### Оценка: 3–4 часа

---

## Фаза 7 — Рефакторинг `@ts-nocheck` + новые API/страницы + удаление shim

Самая мясистая фаза. Порядок — от наименее зависимого к наиболее зависимому.

### 7.1. Переписываем 5 `@ts-nocheck` файлов

| Файл                                                                                         | Строк | Что делаем                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/lib/avito/resolve-session.ts](src/lib/avito/resolve-session.ts)                         | 96    | Убираем проверки `subscription_tier`/`is_vibe_plus` (колонки удалены). `avito_account_limit` оставить (Stage 9). Строгая типизация через `Database` |
| [src/lib/services/orders.ts](src/lib/services/orders.ts)                                     | 208   | Убрать параметр `sellerFilterId`. Все `client_id` → `customer_id` + snapshot-поля. Убрать фильтры seller_id                                         |
| [src/app/api/owner/products/[id]/route.ts](src/app/api/owner/products/%5Bid%5D/route.ts)     | 421   | Убрать `getMainSellerId` dynamic import, убрать проверки `products.seller_id` (колонка удалена). JOIN `customers!orders_customer_id_fkey`           |
| [src/lib/services/dashboard.ts](src/lib/services/dashboard.ts)                               | 584   | Убрать `scope: 'owner'\|'seller'` — только owner. Удалить `getCurrentPlatformFeePct`, seller_shippers JOIN, платформенную комиссию в net-прибыли    |
| [src/lib/analytics/compute-owner-analytics.ts](src/lib/analytics/compute-owner-analytics.ts) | 852   | Убрать `isSellerScope` параметр. `scopeByUserId` → `ownerId`. Остальная логика не меняется                                                          |

Итого ~2160 строк под refactor. Каждый файл завершается `npx tsc --noEmit` (0 ошибок) + сниманием `@ts-nocheck` из шапки.

### 7.2. Удаление shim `src/lib/seller/guards.ts`

Callers (после рефакторинга @ts-nocheck в 6.1 часть уже отвалится):

- [src/app/api/owner/dashboard/route.ts](src/app/api/owner/dashboard/route.ts), [src/app/api/owner/profile/route.ts](src/app/api/owner/profile/route.ts), [src/app/api/owner/orders/route.ts](src/app/api/owner/orders/route.ts), [src/app/api/owner/orders/export/route.ts](src/app/api/owner/orders/export/route.ts), [src/app/api/owner/stats/route.ts](src/app/api/owner/stats/route.ts) — заменить `getMainSellerId(…)` на `session.userId`, убрать `resolveSellerIdParam`.
- После `grep seller/guards src/` → 0 — удаляем [src/lib/seller/guards.ts](src/lib/seller/guards.ts). Проверить `src/lib/seller/rating.ts` — если тоже не используется, удалить папку.

**Фиксируем техдолг тут**, не откладываем дальше.

### 7.3. Новые API-роуты (клиенты + безопасность)

| Endpoint                                      | Назначение                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/owner/customers`                    | Список с фильтрами (`search`, `vibe_enabled`, `is_frozen`, `is_blocked`, `is_top`) + пагинация. Возвращает debt из view |
| `GET /api/owner/customers/[id]`               | Детали + заказы + vibe_payments + debt                                                                                  |
| `PATCH /api/owner/customers/[id]`             | Апдейт имени/телефона/`is_top`/vibe-настроек/блокировки/заметок. Разморозка — запрещена PATCH'ом (только триггер)       |
| `GET /api/owner/customers/[id]/vibe-payments` | История платежей клиента                                                                                                |
| `GET /api/owner/customers/[id]/conversation`  | Последние N сообщений из `customer_conversations`                                                                       |

`POST /api/owner/customers` **не создаём** — клиенты появляются только через `/start` в customer-боте (Stage 3).

Soft-delete клиентов не добавляем (блокировка покрывает кейс).

Дополнительно для `/owner/security`:

| Endpoint                                 | Назначение                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /api/owner/security/risk-profiles`  | Читает view `customer_risk_profile`, фильтры (`open_alerts_only`, `min_return_rate`, `min_cancel_rate`) |
| `POST /api/owner/security/run-detectors` | Ручной запуск `run_fraud_detectors()` (кроме cron-а из Фазы 6)                                          |
| `GET /api/owner/fraud-alerts`            | **Уже существует** — расширить: добавить JOIN на `customers` (вместо `users`) для рендера имени в ленте |
| `PATCH /api/owner/fraud-alerts/[id]`     | **Уже существует** — ничего не меняем                                                                   |

### 7.4. Восстанавливаемые страницы

#### `/owner/clients` (убираем `Stage2Placeholder`)

- Таблица клиентов, поиск, фильтры (vibe / frozen / blocked / is_top), пагинация.
- Колонки: имя, Telegram, телефон, is_top, долг, лимит, статус, дата регистрации.
- Кнопки «Добавить клиента» нет — клиенты появляются только через бот.

#### `/owner/clients/[id]` (убираем `Stage2Placeholder`)

- Карточка: контакты (name/phone/telegram), заметки, ценовой уровень (переключатель `is_top`), +ВАЙБ (enabled, лимит override, текущий долг).
- Вкладки: «Заказы», «Платежи (+ВАЙБ)», «Переписка» (читает `customer_conversations`).
- Действия: заблокировать / разблокировать, переопределить лимит, включить/выключить +ВАЙБ, сделать «топом» / снять.

#### `/owner/security` (убираем `Stage2Placeholder`)

Per-customer риск-панель. Две секции, не перетекают:

**Секция 1: Подозрительные клиенты** (главная, вверху страницы)

- Таблица из `GET /api/owner/security/risk-profiles?open_alerts_only=false&min_return_rate=30&min_cancel_rate=50`.
- Колонки: клиент (имя + tg), всего заказов, % возвратов, % отмен, текущий долг / лимит (с визуальной полосой «% израсходованного лимита»), количество открытых алертов, последняя активность, действия.
- Подсветка строк: красный фон при `open_alerts_count > 0` OR `return_rate_pct > 50`, жёлтый — при `cancel_rate_pct > 50` OR `current_debt / vibe_limit >= 0.9`.
- Клик по строке → `/owner/clients/[id]` (там детали и блокировка).
- В каждой строке раскрывашка «Что не так?» с перечислением открытых алертов и их `details` JSONB (например, `{"orders_per_hour": 7, "threshold": 5}`).
- Кнопка «Запустить детекторы» (POST `/api/owner/security/run-detectors`) — владелец может форсировать прогон, не дожидаясь суточного cron.

**Секция 2: Все активные алерты** (лента, ниже)

- Список `fraud_alerts WHERE status='open'` с JOIN на `customers`.
- Колонки: клиент, тип алерта (локализованное название), severity, когда создан, `details`, действия (резолв, отклонить, открыть карточку клиента).
- Использует существующее `/api/owner/fraud-alerts` (после обновления на `customer_id`).

Блокировка клиента — **не** на этой странице (живёт в `/owner/clients/[id]`).

#### `/owner/settings` (расширяем)

- Новые секции:
  - Бизнес — `business_name`, `business_bio`.
  - +ВАЙБ — `vibe_credit_default_limit`, `vibe_receipt_confirm_threshold`.
  - Реквизиты-шаблон — textarea `payment_requisites_message` + подсказка с поддерживаемыми переменными (`{{amount}}`, `{{order_numbers}}`, `{{card_label}}`, `{{deadline}}`) + live-preview (подставляем тестовые значения).
  - Платёжные методы — таб/подраздел с CRUD по `payment_methods` (форма зависит от `kind`: card / sbp / business_account).

### 7.5. Удаление `stage2-placeholder.tsx`

После восстановления страниц — [src/components/shared/stage2-placeholder.tsx](src/components/shared/stage2-placeholder.tsx) больше не импортируется. `grep` подтверждает → удаляем.

### Оценка: 9–11 часов

---

## Фаза 8 — RLS-тесты + документация + финальная верификация

### 8.1. Новые RLS-тесты (~22 штуки, требование >=10 выполнено с запасом)

В [tests/rls/](tests/rls/):

- `customers.test.ts` — 3 теста: owner SELECT, shipper denied, anon denied
- `business-settings.test.ts` — 3: singleton, owner UPDATE, shipper SELECT разрешён
- `order-messages.test.ts` — 3: owner full, shipper SELECT по активным статусам, anon denied
- `customer-conversations.test.ts` — 2: owner SELECT, остальные denied
- `vibe-payments.test.ts` — 2: owner all, остальные denied (включая `vibe_payment_orders`)
- `payment-methods.test.ts` — 2: owner all, остальные denied (включая `payment_method_month_stats`)
- `data-imports.test.ts` — 2: owner all, остальные denied
- `fraud-alerts.test.ts` — 2: owner SELECT по `customer_id`, shipper/anon denied (обновление существующих, если были)
- `shipper-pickup-points.test.ts` — 3: owner all, shipper видит только свои (`shipper_id=auth.uid()`), anon denied

Плюс обновление [tests/rls/fixtures.ts](tests/rls/fixtures.ts): убрать `legacyClient`, вставить `customer`, привязать заказ на `customer_id`.

Итого: 50 существующих + 22 новых = **72 RLS-теста**.

### 8.2. Документация

- [docs/DATABASE.md](docs/DATABASE.md) — 10 новых таблиц (`customers`, `business_settings`, `vibe_payments`, `vibe_payment_orders`, `payment_methods`, `payment_method_month_stats`, `order_messages`, `customer_conversations`, `data_imports`, `shipper_pickup_points`) + view `customer_vibe_debt` + view `customer_risk_profile` + RPC `next_payment_method` + RPC `run_fraud_detectors`. Описать новые типы `fraud_alerts.alert_type`, двухуровневые цены (`products.drop_price_top` + `customers.is_top`). Обновить секцию `products/product_sizes` (замеры на размере).
- [docs/NAVIGATION.md](docs/NAVIGATION.md) — восстановить `clients*` и `security` без пометки «Stage 2».
- [.claude/plans/dapper-hugging-wozniak.md](.claude/plans/dapper-hugging-wozniak.md) (roadmap): явно зафиксировать: (а) `product_variants` отменён, (б) `data_imports` каркас сейчас/парсер — Stage 8, (в) замеры клиентского тела не делаем, (г) ферма карт `payment_methods` добавлена в Stage 2, (д) fraud-алерты переосмыслены под B2B + появились per-customer риск-профили, (е) двухуровневые цены добавлены, (ж) ПВЗ-каркас `shipper_pickup_points` заложен в Stage 2, UI в Stage 7, (з) адреса клиентов НЕ храним (дропшиппинг).
- Обновить [.claude/handoff.md](.claude/handoff.md) под результат Stage 2.

### 8.3. Финальная верификация

```bash
npm run db:migrate               # все 16 новых миграций применены
npm run db:gen-types             # типы синхронизированы
npx tsc --noEmit                 # 0 ошибок, 0 @ts-nocheck
npm run build                    # exit 0
npm run lint                     # 0 новых ошибок
npm run test:rls                 # 72/72 passed
npm run test:e2e                 # 5/5 passed
```

**Ручной smoke:**

1. Зайти в `/owner/clients` — пустой список (клиентов пока нет). Фильтры и поиск рендерятся.
2. Вставить клиента через Supabase Studio (`tg_user_id`, `name`), обновить — клиент появился в списке.
3. Открыть карточку — все вкладки рендерятся, переключатели `is_top`/`vibe_enabled` работают, `is_frozen` помечается триггером автоматически.
4. Зайти в `/owner/security` — обе секции рендерятся, кнопка «Запустить детекторы» работает (создаёт алерты на тестовом клиенте с `cancel_rate > 70%`).
5. Зайти в `/owner/settings` — новые секции (+ВАЙБ, реквизиты-шаблон с live-preview, платёжные методы) открываются, CRUD платёжного метода работает, ротация в RPC `next_payment_method()` даёт ожидаемую карту.
6. Вставить через Supabase Studio тестовый заказ для клиента с `client_price` выше лимита → `customers.is_frozen=TRUE` автоматически. Вставить `vibe_payment` на всю сумму → `is_frozen=FALSE`.
7. Выставить заказу `status='return_completed'` → долг по этому заказу уходит из view `customer_vibe_debt`.
8. Проверить: у товара с `drop_price=1000`, `drop_price_top=800` и клиента с `is_top=TRUE` — при ручной вставке заказа `client_price` должен быть 800 (логика подставляется в коде оформления заказа).

### Оценка: 3–4 часа

---

## Критические файлы

Миграции (все в `supabase/migrations/`):

- `20260425000001_business_settings.sql` — новая singleton-таблица
- `20260425000003_create_customers.sql` — ключевая таблица клиентов (без addresses/body_measurements, с `is_top`)
- `20260425000004_orders_customer_id.sql` — атомарный переход orders на customers + snapshot
- `20260425000007_vibe_payments.sql` — +ВАЙБ + view + триггер заморозки
- `20260425000008_payment_methods.sql` — ферма карт + RPC
- `20260425000014_two_tier_prices.sql` — `products.drop_price_top`
- `20260425000015_shipper_pickup_points.sql` — ПВЗ + FK на orders + snapshot
- `20260425000016_fraud_alerts_customer_migration.sql` — fraud_alerts на customer_id + view `customer_risk_profile` + детекторы

Код:

- [src/lib/services/orders.ts](src/lib/services/orders.ts), [src/lib/services/dashboard.ts](src/lib/services/dashboard.ts), [src/lib/analytics/compute-owner-analytics.ts](src/lib/analytics/compute-owner-analytics.ts), [src/app/api/owner/products/[id]/route.ts](src/app/api/owner/products/%5Bid%5D/route.ts), [src/lib/avito/resolve-session.ts](src/lib/avito/resolve-session.ts) — все 5 `@ts-nocheck`
- [src/types/database.ts](src/types/database.ts) — добавить `Customer`, `VibePayment`, `PaymentMethod`, `OrderMessage`, `CustomerConversation`, `DataImport`, `BusinessSettings`, `CustomerRiskProfile`, `ShipperPickupPoint`
- [src/utils/pricing.ts](src/utils/pricing.ts) — добавить логику двухуровневой цены (`customer.is_top && product.drop_price_top ? drop_price_top : drop_price`)
- [src/app/api/owner/fraud-alerts/route.ts](src/app/api/owner/fraud-alerts/route.ts) — переключить JOIN с `users` на `customers`
- [src/lib/jobs/queues.ts](src/lib/jobs/queues.ts) — добавить очередь `run-fraud-detectors`, обновить `scripts/worker.ts` cron-ом
- [tests/rls/fixtures.ts](tests/rls/fixtures.ts) — переход на customers
- [src/lib/seller/guards.ts](src/lib/seller/guards.ts) — удалить
- [src/components/shared/stage2-placeholder.tsx](src/components/shared/stage2-placeholder.tsx) — удалить

Новые API/страницы:

- `src/app/api/owner/customers/` — весь CRUD
- `src/app/api/owner/payment-methods/` — весь CRUD
- `src/app/api/owner/security/risk-profiles/route.ts` — GET view `customer_risk_profile`
- `src/app/api/owner/security/run-detectors/route.ts` — POST ручной запуск RPC
- `src/app/(owner)/owner/clients/page.tsx` + `[id]/page.tsx` — восстановить под новую модель
- `src/app/(owner)/owner/security/page.tsx` — восстановить с риск-панелью + лентой алертов
- `src/app/(owner)/owner/settings/page.tsx` — расширить

Документация:

- [docs/DATABASE.md](docs/DATABASE.md)
- [docs/NAVIGATION.md](docs/NAVIGATION.md)
- [.claude/plans/dapper-hugging-wozniak.md](.claude/plans/dapper-hugging-wozniak.md)
- [.claude/handoff.md](.claude/handoff.md)

---

## Оценка времени

| Фаза                                            | Часы           |
| ----------------------------------------------- | -------------- |
| 1. `business_settings` + чистка `users`         | 3–4            |
| 2. `customers` + `orders.customer_id` + CHECK   | 5–6            |
| 3. +ВАЙБ-кредит                                 | 4–5            |
| 4. Ферма карт                                   | 3–4            |
| 5. Telegram + imports + замеры + two-tier + ПВЗ | 3–4            |
| 6. Безопасность клиентов (fraud + риски)        | 3–4            |
| 7. Рефакторинг + API + страницы + shim          | 9–11           |
| 8. RLS-тесты + docs + финал                     | 3–4            |
| **Итого**                                       | **33–42 часа** |

Это 4–5 полных рабочих дней концентрированной работы либо 7–10 дней в нормальном ритме с обсуждениями.

Каждая фаза заканчивается зелёным билдом + отдельным коммитом — любая может быть откачена независимо.

---

## Что остаётся техдолгом после Stage 2

- `shipper_stats`, `shipper_payouts` (старые простые таблицы) — удаляем в Stage 7.
- `users.avito_client_id/secret/account_limit` — остаются до Stage 9 (Avito-интеграция).
- Authenticated e2e-тесты — отложены до Stage 7 (Telegram-login headless нетривиален).
- `shipper_rate_snapshot` в [src/lib/orders/shipper-actions.ts](src/lib/orders/shipper-actions.ts) сейчас `null` — подтянется из `business_settings` в Stage 7 (но таблица `business_settings` уже готова после Stage 2).

---

## Верификация end-to-end

После Stage 2 инсталляция должна:

1. Иметь новую таблицу `customers` с `tg_user_id` как якорем, без `addresses`/`body_measurements`, с `is_top` и +ВАЙБ-полями.
2. Иметь заказы, привязанные к `customers` через `customer_id`, с snapshot-полями для shipper (имя + tg + ПВЗ-лейбл + ПВЗ-адрес).
3. Поддерживать двухуровневые цены: `products.drop_price_top` + `customers.is_top` + логика в `src/utils/pricing.ts`.
4. Автоматически замораживать/размораживать +ВАЙБ-клиентов через триггер.
5. Позволять владельцу управлять фермой платёжных карт (CRUD, ротация RPC `next_payment_method`).
6. Иметь каркас `shipper_pickup_points` с RLS (owner all, shipper только свои) + FK на orders + snapshot. UI — в Stage 7.
7. Иметь пустые (но готовые к записи) таблицы `order_messages`, `customer_conversations`, `data_imports` — заполнятся в Stage 3/6/8.
8. Показывать восстановленные страницы `/owner/clients*` и `/owner/security` под новую модель.
9. Показывать `/owner/security` с per-customer риск-профилями и прогоняемыми детекторами (суточный cron + ручная кнопка).
10. Хранить шаблон реквизитов с переменными (`{{amount}}`, `{{order_numbers}}`, `{{card_label}}`, `{{deadline}}`) в `business_settings.payment_requisites_message`; рендер шаблона — в Stage 3.
11. Билдиться без единого `@ts-nocheck` в репозитории.
12. Проходить 72/72 RLS-теста и 5/5 e2e smoke.

После этого открывается путь к Stage 3 (customer-bot + заказ-флоу + manual payment + +ВАЙБ рабочий).

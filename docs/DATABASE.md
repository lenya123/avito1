# База данных (Supabase PostgreSQL)

## Обзор таблиц

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

---

## Таблица: users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('owner', 'shipper', 'client')),
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  name VARCHAR(255),

  -- Авторизация
  site_key VARCHAR(64) UNIQUE,           -- ключ для клиентов
  password_hash VARCHAR(255),            -- для владельцев/отправщиков

  -- +ВАЙБ
  is_vibe_plus BOOLEAN DEFAULT FALSE,
  vibe_plus_granted_by UUID REFERENCES users(id),
  vibe_plus_granted_at TIMESTAMPTZ,

  -- Финансы
  deposit DECIMAL(12,2) DEFAULT 0,       -- основной депозит
  deposit_limit DECIMAL(12,2) DEFAULT 0, -- лимит минуса (100000 для +ВАЙБ)
  referral_deposit DECIMAL(12,2) DEFAULT 0, -- бонусный депозит

  -- Подписка
  subscription_tier TEXT DEFAULT 'none'
    CHECK (subscription_tier IN ('none', 'basic', 'premium', 'top_floor_boss')),
  subscription_start DATE,
  subscription_end DATE,
  scheduled_subscription_tier TEXT DEFAULT NULL
    CHECK (scheduled_subscription_tier IS NULL OR scheduled_subscription_tier IN ('basic', 'premium', 'top_floor_boss')),

  -- Уровень
  level INT DEFAULT 0,
  total_completed_orders INT DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,

  -- Рефералы
  referral_code VARCHAR(32) UNIQUE,
  referred_by UUID REFERENCES users(id),
  first_order_discount_used BOOLEAN DEFAULT FALSE,

  -- Avito API (для top_floor_boss)
  avito_client_id VARCHAR(255),
  avito_client_secret VARCHAR(255),
  avito_profile_id VARCHAR(255),

  -- Настройки уведомлений
  notification_order_status BOOLEAN DEFAULT TRUE,
  notification_new_products BOOLEAN DEFAULT TRUE,
  notification_promotions BOOLEAN DEFAULT TRUE,

  -- Онбординг
  is_onboarding_completed BOOLEAN DEFAULT FALSE,

  -- Блокировка
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram ON users(telegram_id);
CREATE INDEX idx_users_site_key ON users(site_key);
CREATE INDEX idx_users_referral_code ON users(referral_code);
```

---

## Таблица: products

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  brand VARCHAR(100),

  -- Цены
  purchase_price DECIMAL(10,2) NOT NULL,  -- закупка
  drop_price DECIMAL(10,2) NOT NULL,      -- для дропшипперов
  recommended_price DECIMAL(10,2),        -- рекомендуемая продажа

  -- Фото
  photo_urls TEXT[],
  photo_main_index INT DEFAULT 0,

  -- Замеры (JSON)
  measurements JSONB, -- {"S": {"chest": 50, "length": 70}, "M": {...}}

  -- Статус
  is_premium BOOLEAN DEFAULT FALSE,       -- только для +ВАЙБ
  is_active BOOLEAN DEFAULT TRUE,
  is_in_stock BOOLEAN DEFAULT FALSE,      -- на складе или в пути
  expected_arrival_date DATE,             -- если в пути

  -- Закупка
  supplier_id UUID REFERENCES suppliers(id),
  purchase_date DATE,
  purchase_quantity INT,

  -- Остатки (для товаров без размеров)
  current_quantity INT,                   -- текущее количество
  reserved_quantity INT DEFAULT 0,        -- в процессе оформления

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_active ON products(is_active, is_in_stock);
CREATE INDEX idx_products_category ON products(category);
```

---

## Таблица: product_sizes

```sql
CREATE TABLE product_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(10) NOT NULL,              -- XS, S, M, L, XL, XXL
  initial_quantity INT NOT NULL,          -- при закупке
  current_quantity INT NOT NULL,          -- сейчас
  reserved_quantity INT DEFAULT 0,        -- в процессе оформления

  UNIQUE(product_id, size)
);

CREATE INDEX idx_sizes_available ON product_sizes(product_id)
  WHERE current_quantity > reserved_quantity;
```

---

## Таблица: orders

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,

  -- Клиент
  client_id UUID REFERENCES users(id) NOT NULL,

  -- Товар
  product_id UUID REFERENCES products(id) NOT NULL,
  product_size_id UUID REFERENCES product_sizes(id) NOT NULL,
  size VARCHAR(10) NOT NULL,

  -- Цены (фиксируются на момент заказа)
  purchase_price DECIMAL(10,2) NOT NULL,
  client_price DECIMAL(10,2) NOT NULL,    -- с учётом скидок
  sale_price DECIMAL(10,2),               -- цена продажи покупателю
  client_profit DECIMAL(10,2) GENERATED ALWAYS AS (sale_price - client_price) STORED,

  -- Доставка
  delivery_service TEXT NOT NULL
    CHECK (delivery_service IN ('avito', 'yandex', 'cdek', 'pochta', '5post')),
  tracking_number VARCHAR(100),
  barcode_image_url TEXT,
  delivery_deadline DATE NOT NULL,

  -- Возврат
  return_barcode_image_url TEXT,
  return_tracking_number VARCHAR(100),
  return_code VARCHAR(20),
  return_code_updated_at TIMESTAMPTZ,
  expected_return_date DATE,
  return_pickup_address TEXT,

  -- Статус
  status TEXT DEFAULT 'awaiting_shipment' CHECK (status IN (
    'awaiting_shipment',  -- ждёт отправку
    'collecting',         -- собираем
    'in_transit',         -- в пути
    'completed',          -- завершён
    'return_in_transit',  -- возврат в пути
    'return_arrived',     -- возврат прибыл
    'return_completed',   -- возврат завершён
    'cancelled',          -- отменён
    'problem',            -- проблема
    'trash',              -- утиль (7+ дней на ПВЗ)
    'disposed'            -- аннулирован (30+ дней)
  )),

  -- Оплата
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  payment_id VARCHAR(255),
  payment_method TEXT DEFAULT 'card' CHECK (payment_method IN ('card', 'deposit')),

  -- Тип проблемы (при status = 'problem')
  problem_type TEXT CHECK (problem_type IN ('out_of_stock', 'bad_barcode')),
  linked_return_order_id UUID REFERENCES orders(id), -- связь с возвратом для out_of_stock

  -- Комментарии
  client_comment TEXT,
  system_comment TEXT,

  -- Печать
  barcode_printed BOOLEAN DEFAULT FALSE,
  barcode_printed_at TIMESTAMPTZ,

  -- Источник
  source TEXT DEFAULT 'drop' CHECK (source IN ('drop', 'avito')),
  avito_order_id VARCHAR(255),

  -- Отправка
  shipped_at TIMESTAMPTZ,
  shipped_by UUID REFERENCES users(id),
  pickup_point_id UUID REFERENCES pickup_points(id),

  -- Завершение
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  return_completed_at TIMESTAMPTZ,
  return_completed_by UUID REFERENCES users(id),

  -- Утиль
  trash_at TIMESTAMPTZ,
  trash_deadline TIMESTAMPTZ,

  -- История статусов (реальные даты переходов)
  status_history JSONB DEFAULT '[]',
  -- Формат: [{"status": "awaiting_shipment", "timestamp": "2026-01-15T12:00:00Z"}, ...]

  -- Утиль
  disposed_at TIMESTAMPTZ,

  -- Антифрод
  idempotency_key VARCHAR(64) UNIQUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_deadline ON orders(delivery_deadline)
  WHERE status IN ('awaiting_shipment', 'collecting', 'problem');
```

---

## Таблица: referral_bonuses

```sql
CREATE TABLE referral_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id) NOT NULL,
  referral_id UUID REFERENCES users(id) NOT NULL,

  -- Фиксированный бонус 500₽
  first_order_bonus DECIMAL(10,2) DEFAULT 0,
  first_order_bonus_paid BOOLEAN DEFAULT FALSE,
  first_order_bonus_unlocked_at TIMESTAMPTZ,

  -- Процентный бонус (7% от заказов)
  referral_orders_count INT DEFAULT 0,
  referral_orders_sum DECIMAL(12,2) DEFAULT 0,
  percent_bonus DECIMAL(10,2) DEFAULT 0,
  percent_bonus_cap DECIMAL(10,2) DEFAULT 7000,

  -- Период активности (60 дней)
  bonus_period_ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(referrer_id, referral_id)
);
```

---

## Таблица: settings

```sql
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ставки
  shipper_rate DECIMAL(10,2) DEFAULT 150,

  -- Лимиты заказов в день по уровням
  max_orders_per_day_level_0 INT DEFAULT 10,
  max_orders_per_day_level_1 INT DEFAULT 20,
  max_orders_per_day_level_2 INT DEFAULT 30,
  max_orders_per_day_level_3 INT DEFAULT 999,

  -- Резервирование
  reservation_timeout_minutes INT DEFAULT 10,

  -- Рефералы
  referral_first_order_bonus DECIMAL(10,2) DEFAULT 500,
  referral_percent DECIMAL(5,2) DEFAULT 7,
  referral_percent_cap DECIMAL(10,2) DEFAULT 7000,
  referral_period_days INT DEFAULT 60,
  first_order_discount DECIMAL(10,2) DEFAULT 500,

  -- Сроки возвратов
  return_to_trash_days INT DEFAULT 7,
  trash_to_disposed_days INT DEFAULT 30,

  -- Контакты
  owner_telegram_username VARCHAR(255),
  support_telegram_username VARCHAR(255),

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Инициализация
INSERT INTO settings (id) VALUES (gen_random_uuid());
```

---

## Таблица: payments

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,

  type TEXT NOT NULL CHECK (type IN ('subscription', 'order', 'orders_batch', 'deposit_topup')),
  amount DECIMAL(10,2) NOT NULL,

  order_ids UUID[],                       -- для пакетной оплаты
  subscription_tier TEXT,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),

  payment_system TEXT NOT NULL CHECK (payment_system IN ('yookassa')),
  external_payment_id VARCHAR(255),
  payment_url TEXT,

  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);
```

---

## Таблица: shipper_stats

```sql
CREATE TABLE shipper_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID REFERENCES users(id) NOT NULL,
  date DATE NOT NULL,
  orders_shipped INT DEFAULT 0,
  returns_collected INT DEFAULT 0,
  earnings DECIMAL(10,2) DEFAULT 0,

  UNIQUE(shipper_id, date)
);
```

---

## Остальные таблицы

```sql
-- Поставщики
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  telegram_id BIGINT,
  telegram_username VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  notes TEXT,
  total_purchases DECIMAL(14,2) DEFAULT 0,
  total_items INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ПВЗ
CREATE TABLE pickup_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_service TEXT NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Избранное
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Подписки на поступление
CREATE TABLE product_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  notified BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Расходы
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('purchase', 'shipping', 'salary', 'marketing', 'other')),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  supplier_id UUID REFERENCES suppliers(id),
  product_id UUID REFERENCES products(id),
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Лог активности
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Уведомления
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  sent_to_telegram BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Резервирование размеров и товаров
CREATE TABLE size_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_size_id UUID REFERENCES product_sizes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ровно одно из двух должно быть заполнено
  CONSTRAINT chk_reservation_target CHECK (
    (product_size_id IS NOT NULL AND product_id IS NULL) OR
    (product_size_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_reservation_size_session
  ON size_reservations(product_size_id, session_id) WHERE product_size_id IS NOT NULL;
CREATE UNIQUE INDEX idx_reservation_product_session
  ON size_reservations(product_id, session_id) WHERE product_id IS NOT NULL;

-- Отпечатки устройств (антифрод)
CREATE TABLE user_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fingerprint_hash VARCHAR(64) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Алерты фрода
CREATE TABLE fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'duplicate_fingerprint', 'self_referral', 'rapid_orders',
    'deposit_abuse', 'return_abuse', 'suspicious_cancellation'
  )),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Row Level Security (RLS)

```sql
-- Включение RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- ... для всех таблиц

-- Вспомогательные функции
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner');
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.is_shipper()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'shipper');
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.is_premium_client()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND (is_vibe_plus = TRUE OR subscription_tier IN ('premium', 'top_floor_boss'))
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Политики users
CREATE POLICY "users_select" ON users FOR SELECT
  USING (id = auth.uid() OR auth.is_owner());

CREATE POLICY "users_update" ON users FOR UPDATE
  USING (id = auth.uid() OR auth.is_owner());

-- Политики products
CREATE POLICY "products_select" ON products FOR SELECT
  USING (
    auth.is_owner() OR (
      is_active = TRUE AND (
        is_premium = FALSE OR auth.is_premium_client()
      ) AND (
        is_in_stock = TRUE OR auth.is_premium_client()
      )
    )
  );

CREATE POLICY "products_modify" ON products FOR ALL
  USING (auth.is_owner());

-- Политики orders
CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (
    client_id = auth.uid() OR auth.is_owner() OR (
      auth.is_shipper() AND status IN (
        'awaiting_shipment', 'collecting', 'in_transit',
        'return_in_transit', 'return_arrived'
      )
    )
  );

CREATE POLICY "orders_insert" ON orders FOR INSERT
  WITH CHECK (client_id = auth.uid() OR auth.is_owner());

CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (
    auth.is_owner() OR client_id = auth.uid() OR (
      auth.is_shipper() AND status IN ('awaiting_shipment', 'collecting', 'return_arrived')
    )
  );

-- Политики favorites
CREATE POLICY "favorites_all" ON favorites FOR ALL
  USING (user_id = auth.uid());

-- Политики notifications
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (user_id = auth.uid() OR auth.is_owner());

-- Политики payments
CREATE POLICY "payments_select" ON payments FOR SELECT
  USING (user_id = auth.uid() OR auth.is_owner());
```

---

## Триггеры

```sql
-- Автоматическое обновление updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Уведомление при поступлении товара
CREATE OR REPLACE FUNCTION notify_product_arrival()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_in_stock = FALSE AND NEW.is_in_stock = TRUE THEN
    UPDATE product_notifications
    SET notified = TRUE, notified_at = NOW()
    WHERE product_id = NEW.id AND notified = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_product_arrival
  AFTER UPDATE OF is_in_stock ON products
  FOR EACH ROW EXECUTE FUNCTION notify_product_arrival();

-- Триггер update_product_quantity_on_order ОТКЛЮЧЁН (no-op)
-- Логика восстановления количества при отмене/возврате выполняется в API через RPC.
-- Триггер оставлен как no-op (не удалён) для безопасности.
CREATE OR REPLACE FUNCTION update_product_quantity_on_order()
RETURNS TRIGGER AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
```

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

-- Атомарный декремент reserved_quantity (не ниже 0)
CREATE OR REPLACE FUNCTION decrement_reserved_quantity_safe(
  target_size_id UUID DEFAULT NULL,
  target_product_id UUID DEFAULT NULL
) RETURNS VOID AS $$
-- Уменьшает reserved_quantity на 1 (минимум 0)
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Атомарная автоотмена заказа (используется expire-order job)
CREATE OR REPLACE FUNCTION cancel_order_auto(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'auto_expired'
) RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
-- FOR UPDATE lock, проверяет статус, отменяет, восстанавливает quantity и deposit
-- Поддерживает товары с размерами (product_size_id) и без (product_id)
-- Записывает status_history
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Realtime подписки

```typescript
// Подписка на новые заказы (владелец)
supabase
  .channel("orders")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) =>
    handleNewOrder(payload)
  )
  .subscribe();

// Подписка на изменение статуса (клиент)
supabase
  .channel("my-orders")
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "orders",
      filter: `client_id=eq.${userId}`,
    },
    (payload) => updateOrderStatus(payload)
  )
  .subscribe();
```

---

## Standalone Автопостинг (миграция 20260517000001)

> Обособленный режим (1 оператор, N магазинов). Доступ — `createServiceClientLoose()`
> + ручные типы из `src/types/database.ts` до `npm run db:gen-types`.

| Таблица / колонка | Назначение |
| --- | --- |
| `products.city` | Город размещения объявления. STUB: до интеграции с панелью — `Москва`. |
| `avito_items.orders_count` / `orders_today` | «Заказали» всего / сегодня (как на Avito, для `(+N)`). |
| `avito_browser_sessions.ad_balance` | Аванс (кошелёк объявлений) — KPI «баланс». |
| `avito_browser_sessions.balance_real` / `balance_bonus` | Кэш баланса с Avito OAuth. |
| `avito_browser_sessions.rating` / `rating_count` | Рейтинг магазина (KPI). |
| `avito_browser_sessions.shop_name` | Имя магазина для свитчера. |
| `avito_media_presets` | Банк фото: `kind=cover` (обложки) / `kind=photoset` (фотосеты, группа `set_key`). Источник `manual`/`generated` (Nano Banana). |
| `avito_post_jobs` | Заявки автопостинга: `queued→processing→published\|failed`. `photo_plan` JSONB (обложка+фотосет), результат `avito_item_id`. |
| `avito_promotion_daily` | Дневной расход на продвижение по магазину (`UNIQUE(session_id,date)`). KPI = avg за 7 дней. |
| storage bucket `avito-presets` | Файлы пресетов фото. |

RLS зеркалит существующий стиль (`owner_all` через `is_owner()` + `user_own` по `auth.uid()`); приложение ходит через service client.

### Заказы с Avito (миграции 20260517000002/3)

| Колонка / таблица | Назначение |
| --- | --- |
| `avito_item_stats_daily` | Дневные срезы метрик объявления (для KPI «за месяц»). Пишет sync-orders. |
| `avito_orders.avito_item_id` | По какой объяве заказ (эвристика по заголовку, // STUB). |
| `avito_orders.return_code` | Код возврата при возврате (эвристика из info/status, // STUB). |
| `avito_orders.source_tag` | Тег «заказ с авито» для отдельной страницы панели владельца. |

Seam для панели: `GET /api/owner/avito-orders` (тег `source_tag='avito'`). Список заказов в интерфейс оператора не внедряется (по ТЗ).

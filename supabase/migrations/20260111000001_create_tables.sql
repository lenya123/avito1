-- =====================================================
-- Миграция 1: Создание основных таблиц
-- =====================================================

-- Поставщики (создаём первыми, т.к. products ссылается на них)
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
  created_by UUID
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

-- Пользователи
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('owner', 'shipper', 'client')),
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  name VARCHAR(255),

  -- Авторизация
  site_key VARCHAR(64) UNIQUE,
  password_hash VARCHAR(255),

  -- +ВАЙБ
  is_vibe_plus BOOLEAN DEFAULT FALSE,
  vibe_plus_granted_by UUID REFERENCES users(id),
  vibe_plus_granted_at TIMESTAMPTZ,

  -- Финансы
  deposit DECIMAL(12,2) DEFAULT 0,
  deposit_limit DECIMAL(12,2) DEFAULT 0,
  referral_deposit DECIMAL(12,2) DEFAULT 0,

  -- Подписка
  subscription_tier TEXT DEFAULT 'none'
    CHECK (subscription_tier IN ('none', 'basic', 'premium', 'top_floor_boss')),
  subscription_start DATE,
  subscription_end DATE,

  -- Уровень
  level INT DEFAULT 0,
  total_completed_orders INT DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,

  -- Рефералы
  referral_code VARCHAR(32) UNIQUE,
  referred_by UUID REFERENCES users(id),
  first_order_discount_used BOOLEAN DEFAULT FALSE,

  -- Avito API
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

-- Обновляем suppliers для ссылки на users
ALTER TABLE suppliers ADD CONSTRAINT suppliers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id);

-- Товары
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  brand VARCHAR(100),

  -- Цены
  purchase_price DECIMAL(10,2) NOT NULL,
  drop_price DECIMAL(10,2) NOT NULL,
  recommended_price DECIMAL(10,2),

  -- Фото
  photo_urls TEXT[],
  photo_main_index INT DEFAULT 0,

  -- Замеры
  measurements JSONB,

  -- Статус
  is_premium BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_in_stock BOOLEAN DEFAULT FALSE,
  expected_arrival_date DATE,

  -- Закупка
  supplier_id UUID REFERENCES suppliers(id),
  purchase_date DATE,
  purchase_quantity INT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_active ON products(is_active, is_in_stock);
CREATE INDEX idx_products_category ON products(category);

-- Размеры товаров
CREATE TABLE product_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(10) NOT NULL,
  initial_quantity INT NOT NULL,
  current_quantity INT NOT NULL,
  reserved_quantity INT DEFAULT 0,

  UNIQUE(product_id, size)
);

CREATE INDEX idx_sizes_available ON product_sizes(product_id)
  WHERE current_quantity > reserved_quantity;

-- Заказы
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,

  -- Клиент
  client_id UUID REFERENCES users(id) NOT NULL,

  -- Товар
  product_id UUID REFERENCES products(id) NOT NULL,
  product_size_id UUID REFERENCES product_sizes(id) NOT NULL,
  size VARCHAR(10) NOT NULL,

  -- Цены
  purchase_price DECIMAL(10,2) NOT NULL,
  client_price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2),
  client_profit DECIMAL(10,2) GENERATED ALWAYS AS (sale_price - client_price) STORED,

  -- Доставка
  delivery_service TEXT NOT NULL
    CHECK (delivery_service IN ('avito', 'yandex', 'cdek', 'pochta', 'boxberry', '5post')),
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
  status TEXT DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment',
    'awaiting_shipment',
    'collecting',
    'in_transit',
    'completed',
    'return_in_transit',
    'return_arrived',
    'return_completed',
    'cancelled',
    'problem',
    'trash',
    'disposed'
  )),

  -- Оплата
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  payment_id VARCHAR(255),
  payment_method TEXT DEFAULT 'card' CHECK (payment_method IN ('card', 'deposit')),

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

-- Платежи
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,

  type TEXT NOT NULL CHECK (type IN ('subscription', 'order', 'orders_batch', 'deposit_topup')),
  amount DECIMAL(10,2) NOT NULL,

  order_ids UUID[],
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

-- Реферальные бонусы
CREATE TABLE referral_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id) NOT NULL,
  referral_id UUID REFERENCES users(id) NOT NULL,

  first_order_bonus DECIMAL(10,2) DEFAULT 0,
  first_order_bonus_paid BOOLEAN DEFAULT FALSE,
  first_order_bonus_unlocked_at TIMESTAMPTZ,

  referral_orders_count INT DEFAULT 0,
  referral_orders_sum DECIMAL(12,2) DEFAULT 0,
  percent_bonus DECIMAL(10,2) DEFAULT 0,
  percent_bonus_cap DECIMAL(10,2) DEFAULT 7000,

  bonus_period_ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(referrer_id, referral_id)
);

-- Статистика отправщика
CREATE TABLE shipper_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID REFERENCES users(id) NOT NULL,
  date DATE NOT NULL,
  orders_shipped INT DEFAULT 0,
  returns_collected INT DEFAULT 0,
  earnings DECIMAL(10,2) DEFAULT 0,

  UNIQUE(shipper_id, date)
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

-- Настройки
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  shipper_rate DECIMAL(10,2) DEFAULT 150,

  max_orders_per_day_level_0 INT DEFAULT 10,
  max_orders_per_day_level_1 INT DEFAULT 20,
  max_orders_per_day_level_2 INT DEFAULT 30,
  max_orders_per_day_level_3 INT DEFAULT 999,

  reservation_timeout_minutes INT DEFAULT 15,

  referral_first_order_bonus DECIMAL(10,2) DEFAULT 500,
  referral_percent DECIMAL(5,2) DEFAULT 7,
  referral_percent_cap DECIMAL(10,2) DEFAULT 7000,
  referral_period_days INT DEFAULT 60,
  first_order_discount DECIMAL(10,2) DEFAULT 500,

  return_to_trash_days INT DEFAULT 7,
  trash_to_disposed_days INT DEFAULT 30,

  owner_telegram_username VARCHAR(255),
  support_telegram_username VARCHAR(255),

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Инициализация настроек
INSERT INTO settings (id) VALUES (gen_random_uuid());

-- Резервирование размеров
CREATE TABLE size_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_size_id UUID REFERENCES product_sizes(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_size_id, session_id)
);

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

-- Avito API Integration
-- Новая колонка в users + 3 таблицы для кеширования данных Avito

-- 1. Числовой Avito user ID (из /core/v1/accounts/self)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avito_user_id BIGINT;

-- 2. Кешированные объявления
CREATE TABLE IF NOT EXISTS avito_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avito_item_id BIGINT NOT NULL,
  title VARCHAR(500) NOT NULL,
  price DECIMAL(12,2),
  status VARCHAR(50),
  url TEXT,
  image_url TEXT,
  category_name VARCHAR(200),
  address TEXT,
  views INT DEFAULT 0,
  favorites INT DEFAULT 0,
  contacts INT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, avito_item_id)
);

CREATE INDEX IF NOT EXISTS idx_avito_items_user ON avito_items(user_id);
CREATE INDEX IF NOT EXISTS idx_avito_items_avito_id ON avito_items(avito_item_id);

-- 3. Кешированные чаты
CREATE TABLE IF NOT EXISTS avito_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avito_chat_id VARCHAR(255) NOT NULL,
  buyer_name VARCHAR(255),
  buyer_avito_id BIGINT,
  item_id BIGINT,
  item_title VARCHAR(500),
  item_price DECIMAL(12,2),
  item_image_url TEXT,
  item_url TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_direction VARCHAR(10),
  unread_count INT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, avito_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_avito_chats_user ON avito_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_avito_chats_last_msg ON avito_chats(last_message_at DESC);

-- 4. Кешированные сообщения
CREATE TABLE IF NOT EXISTS avito_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES avito_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avito_message_id VARCHAR(255) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
  content_text TEXT,
  content_image_url TEXT,
  message_type VARCHAR(50) DEFAULT 'text',
  author_id BIGINT,
  avito_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chat_id, avito_message_id)
);

CREATE INDEX IF NOT EXISTS idx_avito_messages_chat ON avito_messages(chat_id, avito_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avito_messages_user ON avito_messages(user_id);

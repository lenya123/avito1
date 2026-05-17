-- AI Sales Agent
-- 6 таблиц для автоответов покупателям в Avito чатах

-- ============================================================
-- 1. Настройки AI-продажника (per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sales_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Режим работы: draft (черновики), auto_simple (авто + черновики), auto_full (полный автомат)
  mode TEXT NOT NULL DEFAULT 'draft'
    CHECK (mode IN ('draft', 'auto_simple', 'auto_full')),

  -- Порог уверенности для auto_simple (0.0 - 1.0)
  confidence_threshold DECIMAL(3,2) DEFAULT 0.85,

  -- Включен/выключен
  is_enabled BOOLEAN DEFAULT FALSE,

  -- Часы работы (когда AI отвечает)
  work_hours_start INT DEFAULT 8,
  work_hours_end INT DEFAULT 23,
  timezone TEXT DEFAULT 'Europe/Moscow',

  -- Лимиты
  max_drafts_per_day INT DEFAULT 200,
  max_auto_sends_per_day INT DEFAULT 100,

  -- Задержка перед отправкой (секунды, имитация "живого" ответа)
  min_response_delay INT DEFAULT 30,
  max_response_delay INT DEFAULT 120,

  -- Уведомления
  notify_on_draft BOOLEAN DEFAULT TRUE,
  notify_on_low_confidence BOOLEAN DEFAULT TRUE,
  notify_daily_summary BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- 2. Версии промптов (self-learning)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sales_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  version INT NOT NULL DEFAULT 1,

  -- Промпт
  system_prompt TEXT NOT NULL,

  -- Few-shot примеры: [{buyer_message, seller_response, context_notes}]
  few_shot_examples JSONB DEFAULT '[]',

  -- Выученные правила (массив строк)
  learned_rules JSONB DEFAULT '[]',

  -- Метаданные
  correction_count INT DEFAULT 0,
  accuracy_at_creation DECIMAL(5,2),

  is_active BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_active
  ON ai_sales_prompt_versions(user_id) WHERE is_active = TRUE;

-- ============================================================
-- 3. Черновики ответов
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sales_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Связь с чатом/сообщением Avito
  avito_chat_id UUID NOT NULL REFERENCES avito_chats(id),
  avito_message_id UUID REFERENCES avito_messages(id),

  -- Контекст (снапшот на момент генерации)
  buyer_message TEXT NOT NULL,
  chat_history JSONB DEFAULT '[]',
  item_context JSONB,
  product_context JSONB,

  -- Черновик
  original_draft TEXT NOT NULL,
  edited_draft TEXT,

  -- AI метаданные
  confidence DECIMAL(3,2),
  reasoning TEXT,
  prompt_version_id UUID REFERENCES ai_sales_prompt_versions(id),
  tokens_used INT,
  generation_time_ms INT,

  -- Статус
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'auto_sent')),

  -- Время
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,

  -- Отправленное сообщение
  sent_avito_message_id VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_user_status ON ai_sales_drafts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_drafts_chat ON ai_sales_drafts(avito_chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_pending ON ai_sales_drafts(user_id, generated_at DESC)
  WHERE status = 'pending';

-- ============================================================
-- 4. Правки (для обучения)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sales_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES ai_sales_drafts(id) ON DELETE CASCADE,

  -- Что было и что стало
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,

  -- Категория правки
  correction_type TEXT DEFAULT 'other'
    CHECK (correction_type IN ('tone', 'factual', 'pricing', 'sizing', 'urgency', 'other')),

  -- AI-анализ правки
  ai_detected_type TEXT,
  ai_analysis TEXT,

  -- Использовано в обучении
  used_in_version_id UUID REFERENCES ai_sales_prompt_versions(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_user_date
  ON ai_sales_corrections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_corrections_unused
  ON ai_sales_corrections(user_id) WHERE used_in_version_id IS NULL;

-- ============================================================
-- 5. Ежедневная аналитика
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sales_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Объёмы
  total_incoming INT DEFAULT 0,
  total_drafts INT DEFAULT 0,
  total_approved INT DEFAULT 0,
  total_edited INT DEFAULT 0,
  total_rejected INT DEFAULT 0,
  total_auto_sent INT DEFAULT 0,
  total_expired INT DEFAULT 0,

  -- Скорость
  avg_generation_time_ms INT,
  avg_review_time_sec INT,
  avg_response_time_sec INT,

  -- Качество
  approval_rate DECIMAL(5,2),
  correction_rate DECIMAL(5,2),

  -- Конверсия
  chats_with_response INT DEFAULT 0,
  chats_with_deal INT DEFAULT 0,

  -- Стоимость
  total_tokens INT DEFAULT 0,
  estimated_cost_usd DECIMAL(8,4),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sales_stats_user_date
  ON ai_sales_daily_stats(user_id, date DESC);

-- ============================================================
-- 6. Маппинг avito_item → product (связь объявлений с каталогом)
-- ============================================================
CREATE TABLE IF NOT EXISTS avito_item_product_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avito_item_id BIGINT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  match_type TEXT DEFAULT 'manual' CHECK (match_type IN ('manual', 'auto')),
  match_confidence DECIMAL(3,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, avito_item_id)
);

CREATE INDEX IF NOT EXISTS idx_mapping_avito_item ON avito_item_product_mapping(avito_item_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE ai_sales_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sales_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sales_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sales_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sales_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE avito_item_product_mapping ENABLE ROW LEVEL SECURITY;

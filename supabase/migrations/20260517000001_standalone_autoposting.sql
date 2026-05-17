-- =============================================================================
-- Standalone Автопостинг — схема Фазы 1
--
-- Добавляет всё, чего не было в исходном проекте для ТЗ:
--  • products.city                — город размещения объявления (заглушка владельца)
--  • avito_items.orders_*         — счётчик «заказали» + за сегодня (как на Avito)
--  • avito_browser_sessions.*     — кэш баланса/аванса/рейтинга магазина для KPI
--  • avito_media_presets          — пресеты фото (обложки + фотосеты) для миксования
--  • avito_post_jobs              — заявки автопостинга (флоу «создать объявление»)
--  • avito_promotion_daily        — дневной расход на продвижение по магазину
--
-- Конвенции мигрированы из существующих файлов: IF NOT EXISTS, update_updated_at(),
-- public.is_owner(), RLS owner_all + user_own. Приложение ходит через service client
-- (RLS — safety net), поэтому политики зеркалят существующий стиль.
-- =============================================================================

-- ── products.city ───────────────────────────────────────────────────────────
-- // STUB: owner-panel — реальный город приходит из карточки товара панели.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT 'Москва';

COMMENT ON COLUMN products.city IS
  'Город размещения объявления. STUB: до интеграции с панелью владельца — Москва.';

-- ── avito_items: «заказали» ──────────────────────────────────────────────────
ALTER TABLE avito_items
  ADD COLUMN IF NOT EXISTS orders_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_today INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN avito_items.orders_count IS 'Сколько раз заказали этот товар (всего).';
COMMENT ON COLUMN avito_items.orders_today IS 'Сколько заказали сегодня (для «+N»).';

-- ── avito_browser_sessions: кэш баланса/рейтинга для KPI дашборда ─────────────
ALTER TABLE avito_browser_sessions
  ADD COLUMN IF NOT EXISTS ad_balance      NUMERIC(12,2),   -- аванс (кошелёк объявлений)
  ADD COLUMN IF NOT EXISTS balance_real    NUMERIC(12,2),   -- реальные деньги
  ADD COLUMN IF NOT EXISTS balance_bonus   NUMERIC(12,2),   -- бонусы
  ADD COLUMN IF NOT EXISTS rating          NUMERIC(3,2),    -- рейтинг магазина 0..5
  ADD COLUMN IF NOT EXISTS rating_count    INT,             -- кол-во отзывов
  ADD COLUMN IF NOT EXISTS balance_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shop_name       TEXT;            -- имя магазина для свитчера

-- =============================================================================
-- avito_media_presets — банк фото для автопостинга
--   kind='cover'    : одиночная обложка (живая/с инета/сгенерённая Nano Banana)
--   kind='photoset' : фото из живого фотосета; фотосет группируется set_key
-- Миксер берёт 1 обложку + ВЕСЬ фотосет одного set_key, затем уникализирует.
-- =============================================================================
CREATE TABLE IF NOT EXISTS avito_media_presets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('cover', 'photoset')),
  set_key       TEXT,                          -- группа фотосета (NULL для cover)
  storage_path  TEXT NOT NULL,                 -- путь в bucket avito-presets
  public_url    TEXT,                          -- кэш публичного URL
  source        TEXT NOT NULL DEFAULT 'manual' -- manual | generated (nano-banana)
                  CHECK (source IN ('manual', 'generated')),
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL, -- опц. привязка
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER avito_media_presets_updated_at
  BEFORE UPDATE ON avito_media_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS avito_media_presets_user_kind_idx
  ON avito_media_presets(user_id, kind, is_active);
CREATE INDEX IF NOT EXISTS avito_media_presets_set_idx
  ON avito_media_presets(user_id, set_key) WHERE set_key IS NOT NULL;

ALTER TABLE avito_media_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avito_media_presets_owner_all" ON avito_media_presets
  USING (public.is_owner());
CREATE POLICY "avito_media_presets_user_own" ON avito_media_presets
  USING (user_id = auth.uid());

-- =============================================================================
-- avito_post_jobs — заявка автопостинга (флоу «создать объявление»)
-- Жизненный цикл: queued → processing → published | failed.
-- Воркер (BullMQ avito-post-listing) публикует через stealth-браузер сессии.
-- =============================================================================
CREATE TABLE IF NOT EXISTS avito_post_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES avito_browser_sessions(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  price           NUMERIC(12,2) NOT NULL,
  city            TEXT NOT NULL DEFAULT 'Москва',
  metro           TEXT,                          -- рандом-метро коричневого кольца
  description     TEXT,                          -- сгенерённое описание (GPT)
  photo_plan      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {cover, photoset:[...]}
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','processing','published','failed','cancelled')),
  avito_item_id   TEXT,                          -- результат публикации
  avito_item_url  TEXT,
  error_message   TEXT,
  attempts        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);

CREATE OR REPLACE TRIGGER avito_post_jobs_updated_at
  BEFORE UPDATE ON avito_post_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS avito_post_jobs_user_idx ON avito_post_jobs(user_id);
CREATE INDEX IF NOT EXISTS avito_post_jobs_status_idx ON avito_post_jobs(status);
CREATE INDEX IF NOT EXISTS avito_post_jobs_session_idx ON avito_post_jobs(session_id);

ALTER TABLE avito_post_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avito_post_jobs_owner_all" ON avito_post_jobs
  USING (public.is_owner());
CREATE POLICY "avito_post_jobs_user_own" ON avito_post_jobs
  USING (user_id = auth.uid());

-- =============================================================================
-- avito_promotion_daily — дневной расход на продвижение по магазину
-- Источник: getOperationsHistory(), агрегируется sync-джобом.
-- KPI «ср. расход на продвижение/день» = avg(amount) за последние 7 дней.
-- =============================================================================
CREATE TABLE IF NOT EXISTS avito_promotion_daily (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES avito_browser_sessions(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, date)
);

CREATE INDEX IF NOT EXISTS avito_promotion_daily_user_date_idx
  ON avito_promotion_daily(user_id, date DESC);

ALTER TABLE avito_promotion_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avito_promotion_daily_owner_all" ON avito_promotion_daily
  USING (public.is_owner());
CREATE POLICY "avito_promotion_daily_user_own" ON avito_promotion_daily
  USING (user_id = auth.uid());

-- =============================================================================
-- Storage bucket для пресетов фото (приватный; URL выдаём через signed/public).
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avito-presets', 'avito-presets', true)
ON CONFLICT (id) DO NOTHING;

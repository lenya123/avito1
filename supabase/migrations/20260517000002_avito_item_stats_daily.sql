-- =============================================================================
-- avito_item_stats_daily — дневные срезы метрик объявления.
--
-- В исходном проекте у avito_items были только КУМУЛЯТИВНЫЕ views/favorites/
-- contacts + *_today. ТЗ требует KPI «за месяц», для чего нужна дневная история.
--
-- Заполняется sync-джобом (Фаза 5): каждый прогон апсертит срез за сегодня.
-- Дашборд считает «за месяц» = sum за последние 30 дней; пока истории нет —
-- overview API фолбэчится на кумулятивные тоталы (UI не пустой).
-- =============================================================================
CREATE TABLE IF NOT EXISTS avito_item_stats_daily (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES avito_browser_sessions(id) ON DELETE CASCADE,
  avito_item_id TEXT NOT NULL,
  date          DATE NOT NULL,
  views         INT NOT NULL DEFAULT 0,
  favorites     INT NOT NULL DEFAULT 0,
  contacts      INT NOT NULL DEFAULT 0,
  orders        INT NOT NULL DEFAULT 0,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, avito_item_id, date)
);

CREATE INDEX IF NOT EXISTS avito_item_stats_daily_session_date_idx
  ON avito_item_stats_daily(session_id, date DESC);
CREATE INDEX IF NOT EXISTS avito_item_stats_daily_user_date_idx
  ON avito_item_stats_daily(user_id, date DESC);

ALTER TABLE avito_item_stats_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avito_item_stats_daily_owner_all" ON avito_item_stats_daily
  USING (public.is_owner());
CREATE POLICY "avito_item_stats_daily_user_own" ON avito_item_stats_daily
  USING (user_id = auth.uid());

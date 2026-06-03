-- Security page improvements: workflow statuses, audit trail, trends

-- 1. Статус workflow на fraud_alerts
ALTER TABLE fraud_alerts
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved'));

-- Синхронизируем с is_resolved
UPDATE fraud_alerts SET status = 'resolved' WHERE is_resolved = true;

-- 2. Заметка при резолве
ALTER TABLE fraud_alerts
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- 3. Трек Telegram-уведомлений
ALTER TABLE fraud_alerts
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- 4. Индекс для быстрых запросов по статусу
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status_created
  ON fraud_alerts(status, created_at DESC);

-- 5. Таблица снэпшотов для трендов (1 строка/день)
CREATE TABLE IF NOT EXISTS security_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  health_score INTEGER NOT NULL,
  unresolved_alerts INTEGER NOT NULL DEFAULT 0,
  return_rate INTEGER NOT NULL DEFAULT 0,
  cancel_rate INTEGER NOT NULL DEFAULT 0,
  blocked_users INTEGER NOT NULL DEFAULT 0,
  total_clients INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE security_snapshots ENABLE ROW LEVEL SECURITY;

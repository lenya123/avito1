-- M1: Финансовые настройки платформы
-- Глобальная ставка комиссии + параметры выплат селлерам

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS platform_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00
    CHECK (platform_commission_pct >= 0 AND platform_commission_pct <= 50),
  ADD COLUMN IF NOT EXISTS payout_cadence TEXT NOT NULL DEFAULT 'weekly'
    CHECK (payout_cadence IN ('weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS payout_weekday SMALLINT NOT NULL DEFAULT 1
    CHECK (payout_weekday BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS payout_reserve_days SMALLINT NOT NULL DEFAULT 0
    CHECK (payout_reserve_days BETWEEN 0 AND 60);

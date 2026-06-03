-- M7: Заделка под Фазу 4 (ЮKassa Safe Deal + Split)
-- Все колонки nullable, не используются до интеграции ЮKassa

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS yookassa_shop_id TEXT,
  ADD COLUMN IF NOT EXISTS yookassa_onboarding_status TEXT
    CHECK (yookassa_onboarding_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS payout_inn TEXT,
  ADD COLUMN IF NOT EXISTS payout_ogrn TEXT,
  ADD COLUMN IF NOT EXISTS payout_account TEXT,
  ADD COLUMN IF NOT EXISTS payout_bik TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS yookassa_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS yookassa_deal_id TEXT;

ALTER TABLE public.seller_payouts
  ADD COLUMN IF NOT EXISTS yookassa_transfer_id TEXT;

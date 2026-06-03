-- Гибкий роутинг уведомлений: для каждого типа владелец выбирает, кто
-- его получает — он сам или директор. Дефолты выбраны под операционную
-- модель «владелец = стратегия + финансы, директор = клиенты».
--
-- Если у владельца нет директора (поле director_tg_user_id пусто) — все
-- 'director'-типы автоматом fallback на владельца (см. resolveCustomerOpsTarget).

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS notification_routes JSONB NOT NULL DEFAULT '{
    "receipt_review": "director",
    "order_problem": "director",
    "partner_silent_24h": "director",
    "partner_debt_received": "owner",
    "withdrawal_request": "owner",
    "daily_summary": "owner",
    "security_alert": "owner"
  }'::jsonb;

COMMENT ON COLUMN public.business_settings.notification_routes IS
  'Маппинг тип уведомления → recipient (owner|director). Применяется внутри sendNotificationByRoute. Если выбран director, но он не привязан — fallback на owner.';

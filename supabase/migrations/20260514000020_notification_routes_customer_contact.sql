-- Walkthrough фазы 2 (#7): добавить ключ customer_contact в
-- business_settings.notification_routes. Это маршрут для кнопки
-- «Написать владельцу» в customer-bot карточке заказа: вместо
-- глобального business_settings.support_telegram_username — гибкий
-- роутинг (owner / director / partner — последний резолвится в #2
-- отдельной логикой). Дефолт — director (он оперирует с клиентами).
--
-- Обновляем JSONB-default: новые записи получат ключ автоматически.
-- Существующие записи бэкфиллим — добавляем ключ с дефолтным значением,
-- не трогая остальные значения, если они уже настроены.

ALTER TABLE public.business_settings
  ALTER COLUMN notification_routes SET DEFAULT '{
    "receipt_review": "director",
    "order_problem": "director",
    "partner_silent_24h": "director",
    "partner_debt_received": "owner",
    "withdrawal_request": "owner",
    "daily_summary": "owner",
    "security_alert": "owner",
    "customer_contact": "director"
  }'::jsonb;

UPDATE public.business_settings
  SET notification_routes = notification_routes || '{"customer_contact": "director"}'::jsonb
  WHERE NOT (notification_routes ? 'customer_contact');

-- ============================================================================
-- ТЗ Авито-заказы §15.9: per-session apiKey для BeduinUI endpoints
-- (/api/2/profile/order, /api/2/order-log).
--
-- Авито выдаёт стабильный per-user токен (наблюдалось значение
-- af0deccbgcgidddjgnvljitntccdduijhdinfgjgfjir) в HTML главной orders
-- страницы. Извлекаем после успешного login и храним здесь.
--
-- Истекает вместе с сессией Avito (cookies) — обновляется при relogin'е.
-- ============================================================================

ALTER TABLE public.avito_browser_sessions
  ADD COLUMN IF NOT EXISTS api_key TEXT;

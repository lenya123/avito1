-- Backfill: существующие строки business_settings с дефолтным 14 → 21.
-- Если кто-то уже поменял настройку вручную в любую другую сторону — не трогаем.

UPDATE public.business_settings
SET pickup_by_max_days = 21
WHERE pickup_by_max_days = 14;

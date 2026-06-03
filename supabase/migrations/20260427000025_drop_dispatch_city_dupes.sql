-- Откат части миграции 024.
--
-- В миграции 024 ошибочно добавлены колонки products.dispatch_city и
-- business_settings.default_dispatch_city — оказалось, эту функциональность
-- уже выполняют существующие products.location_city и
-- settings.default_location_city (миграция 20260408000002), с готовым UI.
-- Дропаем дубли, переподключаем customer-bot к location_city.

ALTER TABLE public.products
  DROP COLUMN IF EXISTS dispatch_city;

ALTER TABLE public.business_settings
  DROP COLUMN IF EXISTS default_dispatch_city;

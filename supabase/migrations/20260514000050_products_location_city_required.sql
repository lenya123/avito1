-- Walkthrough фазы 2: products.location_city становится обязательным.
-- Решение от 2026-05-05 (memory product_city_required): город нужен
-- для логистики (отправщик / клиент видят откуда едет товар), для
-- авито-карточек, для группировки по складам. Товар без города
-- бесполезен в B2B-обороте.
--
-- Порядок:
--   1. Backfill — UPDATE products SET location_city = COALESCE(
--      settings.default_location_city, 'Москва') WHERE NULL.
--   2. ALTER COLUMN SET NOT NULL.
--   3. Снимаем DEFAULT NULL чтобы insert без значения упал явно.
--
-- Fallback на 'Москва' — потому что settings.default_location_city
-- сам по себе nullable: если владелец не задал дефолт, UPDATE с
-- настроек даст NULL и последующий ALTER NOT NULL упадёт. 'Москва' —
-- разумный универсальный fallback (можно поменять руками после
-- выкатки если нужно).

UPDATE public.products
  SET location_city = COALESCE(
    (SELECT default_location_city FROM public.settings LIMIT 1),
    'Москва'
  )
  WHERE location_city IS NULL OR trim(location_city) = '';

ALTER TABLE public.products
  ALTER COLUMN location_city SET NOT NULL,
  ALTER COLUMN location_city DROP DEFAULT;

COMMENT ON COLUMN public.products.location_city IS
  'Город склада товара (NOT NULL с 2026-05-14). Источник истины для дefault dispatch_city при создании заказа — фактический dispatch берётся в зависимости от source_warehouse: owner → products.location_city, partner → partners.warehouse_city.';

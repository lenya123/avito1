-- partners.warehouse_city: NOT NULL + backfill из business_settings.default_location_city.

UPDATE public.partners p
   SET warehouse_city = COALESCE(
     (SELECT default_location_city FROM public.settings LIMIT 1),
     'Not specified'
   )
 WHERE warehouse_city IS NULL OR warehouse_city = '';

ALTER TABLE public.partners
  ALTER COLUMN warehouse_city SET NOT NULL;

ALTER TABLE public.partners
  ADD CONSTRAINT partners_warehouse_city_not_blank
  CHECK (length(trim(warehouse_city)) > 0);

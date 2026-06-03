-- Backfill snapshot-источника на исторических orders. Старая бинарная модель
-- (partner_id + partner_stock_location) однозначно мапится в новую:
--   - не-партнёрский → owner / owner
--   - партнёрский + owner_warehouse → partner / owner
--   - партнёрский + partner_warehouse (или NULL) → partner / partner
-- Это нужно для shipper API после миграции 27 (фильтр на source_warehouse='owner').

UPDATE public.orders
SET
  source_kind = CASE WHEN partner_id IS NULL THEN 'owner' ELSE 'partner' END,
  source_warehouse = CASE
    WHEN partner_id IS NULL THEN 'owner'
    WHEN partner_stock_location = 'owner_warehouse' THEN 'owner'
    ELSE 'partner'
  END,
  source_partner_id = partner_id
WHERE source_warehouse IS NULL;

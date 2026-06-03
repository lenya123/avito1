-- Канон ПВЗ: «адрес-снимок, без связи» (walkthrough 2026-05-16).
-- orders.pickup_point_id ссылался на shipper_pickup_points (всегда пустую) →
-- mark_sent с выбранным ПВЗ молча падал по FK. Адрес ПВЗ теперь хранится
-- в pickup_point_label_snapshot / pickup_point_address_snapshot (снимок,
-- устойчив к удалению/правке адреса в справочнике). pickup_point_id
-- остаётся как нестрогая ссылка без integrity.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_pickup_point_id_fkey;

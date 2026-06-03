-- Мёртвая таблица: shipper_pickup_points никогда не заполнялась (нет ни
-- одного INSERT в коде), читался только SELECT-join в shipper/orders.
-- Справочник ПВЗ ведётся в pickup_points (через /api/shipper/pickup-points).
-- См. 20260516000010 — переход на снимок адреса.
DROP TABLE IF EXISTS public.shipper_pickup_points;

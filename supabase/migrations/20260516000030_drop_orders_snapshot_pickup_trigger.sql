-- Триггер trg_orders_snapshot_pickup_point (миграция 20260425000015)
-- читал в теле public.shipper_pickup_points для заполнения snapshot-полей.
-- Таблица удалена (20260516000020) → ЛЮБОЙ UPDATE по orders падал
-- 42P01 "relation shipper_pickup_points does not exist".
-- Канон ПВЗ теперь «снимок адреса из приложения» (executeShip сам пишет
-- pickup_point_label_snapshot/address_snapshot из pickup_points) —
-- БД-триггер больше не нужен и затирал бы снимок в NULL.
DROP TRIGGER IF EXISTS trg_orders_snapshot_pickup_point ON public.orders;

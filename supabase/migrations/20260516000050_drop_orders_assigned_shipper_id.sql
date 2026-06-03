-- #2 dual-field phaseout: убираем legacy-колонку orders.assigned_shipper_id.
-- Канон §4.3: принадлежность заказа отправщику = claimed_by (единственное
-- поле). assigned_shipper_id дублировал claimed_by, читался только в
-- daily-shipper-cleanup (переведён на claimed_by) и мог рассинхронизироваться
-- (paid→problem ставил claimed_by без assigned_shipper_id → отправщик
-- пропускался в полночном KPI-уведомлении). Дроп колонки автоматически
-- снимает FK orders_assigned_shipper_id_fkey (других ссылок нет).
ALTER TABLE public.orders DROP COLUMN IF EXISTS assigned_shipper_id;

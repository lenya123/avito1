-- Walkthrough фазы 2 (#1 KPI orders_taken): отдельный счётчик «взял в работу»
-- в дополнение к orders_shipped. Метрика «процент успешных отправок» =
-- orders_shipped / orders_taken. Инкрементится в executeStartCollecting
-- (paid → collecting) через отдельный простой RPC, чтобы не путать с
-- увесистой логикой increment_shipper_stat (она пересчитывает earnings,
-- streak, bonus — здесь это не нужно).
ALTER TABLE public.shipper_stats
  ADD COLUMN IF NOT EXISTS orders_taken INT NOT NULL DEFAULT 0;

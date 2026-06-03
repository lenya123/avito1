-- Backfill партнёров с warehouse_city='Not specified' (было заполнено
-- предыдущей миграцией для записей без значения) → 'Не указан'.
-- Владелец сам обновит реальные города через UI.

UPDATE public.partners
   SET warehouse_city = 'Не указан'
 WHERE warehouse_city = 'Not specified';

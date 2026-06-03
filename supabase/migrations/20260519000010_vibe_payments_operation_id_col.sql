-- Anti-replay для +ВАЙБ-платежей (канон §8.1).
-- Раньше: чек погашения +ВАЙБ-долга распознавался Vision'ом, но
-- operation_id (номер банковской операции) НЕ сохранялся на
-- vibe_payments и НЕ проверялся на повтор. Тот же чек можно было
-- провести дважды → долг «гасился» на двойную сумму при поступлении
-- денег один раз. Канон §8.1 требует anti-replay в едином namespace
-- orders.vision_operation_id + vibe_payments.operation_id.
--
-- Этот файл — только колонка. Уникальный индекс — отдельной миграцией
-- (Supabase pooler не принимает мульти-statement в одном файле).

ALTER TABLE public.vibe_payments
  ADD COLUMN IF NOT EXISTS operation_id TEXT;

COMMENT ON COLUMN public.vibe_payments.operation_id IS
  'Номер банковской операции из Vision-распознавания чека. Anti-replay (канон §8.1): уникален в namespace orders.vision_operation_id + vibe_payments.operation_id. NULL для партнёрского маршрута (без Vision) и старых записей.';

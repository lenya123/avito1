-- Сохраняем путь к чеку в orders, чтобы можно было показать оригинал
-- директору при подозрении на replay (тот же operation_id во 2-й pending'е).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_storage_path TEXT;

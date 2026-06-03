-- Anti-replay для +ВАЙБ-платежей (канон §8.1), часть 2: уникальный
-- индекс. Гарантия на уровне БД: один и тот же operation_id не может
-- дать второй vibe_payments-строки (повторный insert → 23505 → job
-- падает, без двойного погашения долга). Защита-страховка поверх
-- явной anti-replay-проверки в recognize-receipt.
--
-- Partial WHERE operation_id IS NOT NULL: партнёрский маршрут (без
-- Vision) и старые записи имеют NULL — они не конфликтуют.

CREATE UNIQUE INDEX IF NOT EXISTS vibe_payments_operation_id_uniq
  ON public.vibe_payments (operation_id)
  WHERE operation_id IS NOT NULL;

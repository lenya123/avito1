-- Экран 5 walkthrough: реквизиты владельца под новую модель.
--
-- Что меняем в `payment_methods`:
--   1. `kind` 'business_account' → 'ip_qr' (вместо текста ИНН/КПП/р-с/БИК
--      владелец грузит фото QR-кода — симметрично партнёрам).
--   2. Колонка `qr_storage_path` TEXT — путь в Supabase Storage bucket
--      `payment-requisites` (для kind='ip_qr').
--   3. Колонка `business_requisites` JSONB — больше не нужна, удаляем.
--   4. RPC `next_payment_method` — обновить сортировку под новый kind.
--
-- Финансовая модель (single-tenant, owner-only RLS) не меняется:
-- ферма с ротацией по приоритету / лимиту, ИП-QR в конце очереди.

-- 1. Перевод существующих записей (если были) с business_account на ip_qr.
UPDATE public.payment_methods
   SET kind = 'ip_qr'
 WHERE kind = 'business_account';

-- 2. Замена CHECK constraint.
ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_kind_check;

ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_kind_check
  CHECK (kind IN ('card', 'sbp', 'ip_qr'));

-- 3. Новая колонка для QR-фото.
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS qr_storage_path TEXT;

-- 4. Удаляем legacy `business_requisites`.
ALTER TABLE public.payment_methods
  DROP COLUMN IF EXISTS business_requisites;

-- 5. Обновляем RPC `next_payment_method` — ip_qr в конец очереди
-- (предпочитаем карты/СБП с авто-конфирмом Vision; QR требует ручной
-- проверки клиентом).

CREATE OR REPLACE FUNCTION public.next_payment_method(p_amount NUMERIC)
RETURNS SETOF public.payment_methods
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.*
  FROM public.payment_methods pm
  LEFT JOIN public.payment_method_month_stats st
    ON st.payment_method_id = pm.id
    AND st.year_month = to_char(NOW(), 'YYYY-MM')
  WHERE pm.is_active = TRUE
    AND (pm.monthly_limit IS NULL
         OR COALESCE(st.amount_used, 0) + p_amount <= pm.monthly_limit)
  ORDER BY (pm.kind = 'ip_qr') ASC, pm.sort_order ASC, pm.id ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.next_payment_method IS
  'Следующая карта/СБП/ИП-QR по ротации с учётом месячного лимита. ИП-QR — последним.';

-- 6. Bucket для QR-фото владельца (private, owner-only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-requisites', 'payment-requisites', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: только service_role может писать. Чтение тоже через service-role
-- (web-панель проксирует через API endpoint). Для anon — закрыто.
DROP POLICY IF EXISTS payment_requisites_service_all ON storage.objects;
CREATE POLICY payment_requisites_service_all ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'payment-requisites')
  WITH CHECK (bucket_id = 'payment-requisites');

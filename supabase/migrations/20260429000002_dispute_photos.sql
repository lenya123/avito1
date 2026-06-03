-- Phase D — «Плохое качество товара»: storage bucket + поля на orders.
--
-- Логика (BUSINESS_LOGIC §6.4 расширение):
--   Шипер на ПВЗ при приёмке возврата видит брак → жмёт «Плохое качество».
--   Обязательно: ≥3 фото + текст описания. Без них кнопка не активна.
--   Заказ → return_done с fault_reason='bad_quality', товар на склад НЕ возвращается.
--   Клиенту приходит DM с фотками + инструкцией про обращение в Авито-поддержку.
--   Деньги клиенту автоматически НЕ возвращаются (они никогда и не должны при
--   bad_quality — Авито-поддержка возмещает после расследования).
--
-- Поля на orders:
--   dispute_photos JSONB — массив URL фотографий в Storage bucket dispute-photos.
--   dispute_reason TEXT — описание проблемы от отправщика.
--   (fault_reason уже расширим — добавим 'bad_quality' к существующему CHECK.)

-- =====================================================================
-- 1. Поля на orders
-- =====================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispute_photos JSONB,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

COMMENT ON COLUMN public.orders.dispute_photos IS
  'URL-массив фотографий «плохого качества» (≥3 штук), снятых отправщиком на ПВЗ. Bucket dispute-photos. Заполняется только при fault_reason=bad_quality.';
COMMENT ON COLUMN public.orders.dispute_reason IS
  'Описание проблемы от отправщика при «плохом качестве». Обязательное при fault_reason=bad_quality.';

-- =====================================================================
-- 2. Расширение fault_reason CHECK — добавляем 'bad_quality'
-- =====================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fault_reason_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fault_reason_check
  CHECK (
    fault_reason IS NULL
    OR fault_reason IN ('no_attempts', 'wrong_data', 'no_response', 'late_report', 'bad_quality')
  );

-- =====================================================================
-- 3. Storage bucket для фотографий
-- =====================================================================

-- Public, чтобы Telegram media-group мог отдать фото клиенту по URL.
-- (Чеки приватные — там signed URLs; здесь же фотки идут в DM как public.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispute-photos', 'dispute-photos', TRUE)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  -- Owner/admin читают всё.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'dispute_photos_owner_select'
  ) THEN
    CREATE POLICY "dispute_photos_owner_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'dispute-photos' AND public.is_owner());
  END IF;

  -- Shipper кладёт (через service_role в API; политика на всякий случай).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'dispute_photos_shipper_insert'
  ) THEN
    CREATE POLICY "dispute_photos_shipper_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'dispute-photos' AND public.is_shipper());
  END IF;
END
$$;

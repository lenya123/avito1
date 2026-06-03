-- Stage 2.4 — Private storage bucket для чеков клиентов.
--
-- Пишет customer-bot (service_role, Stage 3). Владелец скачивает через
-- signed URL из API (Stage 2.7 — /api/owner/customers/[id]/vibe-payments).
-- Публичного доступа нет.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('receipts', 'receipts', FALSE)
  ON CONFLICT (id) DO NOTHING;

-- Политики: service_role обходит RLS (используется в customer-bot + serverside signed URL).
-- Для authenticated owner даём select (чтобы смотреть в Studio, если надо).
-- anon доступа нет.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'receipts_owner_select'
  ) THEN
    CREATE POLICY "receipts_owner_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'receipts' AND public.is_owner());
  END IF;
END
$$;

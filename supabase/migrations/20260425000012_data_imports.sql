-- Stage 2.5 — Каркас для CSV/XLSX-импорта товаров/клиентов (UI и парсер — Stage 8).
--
-- Здесь только схема: владелец заливает файл → запись draft → воркер парсит →
-- completed/failed с error_log. FK на products/customers.import_id — Stage 8.

CREATE TABLE IF NOT EXISTS public.data_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('products', 'customers', 'orders')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'completed', 'failed', 'cancelled')),
  source_file_url TEXT,
  source_format TEXT CHECK (source_format IN ('xlsx', 'csv', 'json', 'google_sheets')),

  total_rows INT,
  processed_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  error_log JSONB,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_imports_status ON public.data_imports(status, created_at DESC);

ALTER TABLE public.data_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_imports_owner_all ON public.data_imports
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

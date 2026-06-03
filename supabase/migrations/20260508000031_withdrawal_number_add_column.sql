-- Колонка nullable, потом backfill, потом NOT NULL + UNIQUE + DEFAULT.
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS withdrawal_number INTEGER;

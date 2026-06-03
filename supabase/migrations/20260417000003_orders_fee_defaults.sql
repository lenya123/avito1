-- Fix: add DEFAULT values so Supabase generated types mark these as optional in Insert type.
-- The BEFORE INSERT trigger overrides these defaults with real values from settings.
ALTER TABLE public.orders
  ALTER COLUMN fee_pct_snapshot SET DEFAULT 0,
  ALTER COLUMN platform_fee_amount SET DEFAULT 0;

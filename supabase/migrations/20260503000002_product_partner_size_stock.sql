-- Сток партнёра per-размер на конкретной привязке. Размеры партнёра не FK к product_sizes —
-- у партнёра может быть свой набор. UI владельца предлагает размеры из product_sizes, но физически независимы.

CREATE TABLE public.product_partner_size_stock (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id        UUID NOT NULL REFERENCES public.product_partner_bindings(id) ON DELETE CASCADE,
  size              TEXT NOT NULL,
  current_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (binding_id, size)
);

CREATE INDEX ix_ppss_binding ON public.product_partner_size_stock (binding_id);

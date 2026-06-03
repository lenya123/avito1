-- size_reservations расширяется снапшотом источника. size_text нужен потому что для
-- partner-источника product_size_id (ссылка на product_sizes владельца) не несёт смысла,
-- DEC reserved делается по (binding_id, size).

ALTER TABLE public.size_reservations
  ADD COLUMN source_kind       TEXT NOT NULL DEFAULT 'owner'
    CHECK (source_kind IN ('owner','partner')),
  ADD COLUMN source_binding_id UUID NULL REFERENCES public.product_partner_bindings(id),
  ADD COLUMN size_text         TEXT NULL;

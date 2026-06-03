-- Snapshot источника на pending_orders: кто продал размер (источник), на чьём складе товар лежит,
-- через какую binding-привязку. + флаг is_vibe_debt — для +ВАЙБ-flow без TTL и без чека.

ALTER TABLE public.pending_orders
  ADD COLUMN source_kind        TEXT NULL CHECK (source_kind IN ('owner','partner')),
  ADD COLUMN source_binding_id  UUID NULL REFERENCES public.product_partner_bindings(id),
  ADD COLUMN source_partner_id  UUID NULL REFERENCES public.partners(id),
  ADD COLUMN source_warehouse   TEXT NULL CHECK (source_warehouse IN ('owner','partner')),
  ADD COLUMN is_vibe_debt       BOOLEAN NOT NULL DEFAULT FALSE;

-- Привязки партнёров к товарам (лестница). Несколько партнёров на товар, отсортированных по priority.
-- Партнёр становится источником размера, когда у предыдущих по очереди (включая владельца) этот размер закончился.

CREATE TABLE public.product_partner_bindings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  partner_id     UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  priority       INTEGER NOT NULL,
  warehouse_kind TEXT NOT NULL CHECK (warehouse_kind IN ('owner','partner')),
  commission     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX uq_ppb_product_partner_alive
  ON public.product_partner_bindings (product_id, partner_id)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_ppb_product_priority
  ON public.product_partner_bindings (product_id, priority)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_ppb_partner
  ON public.product_partner_bindings (partner_id)
  WHERE deleted_at IS NULL;

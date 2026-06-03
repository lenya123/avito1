-- Долг партнёра перед владельцем. Создаётся когда партнёр сказал «деньги пришли но
-- размер/товар закончился» — владелец автокредитнул клиента, партнёр должен владельцу.

CREATE TABLE public.partner_owner_debts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  UUID NOT NULL REFERENCES public.partners(id),
  order_id    UUID NULL REFERENCES public.orders(id),
  pending_id  UUID NULL,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason      TEXT NOT NULL CHECK (reason IN
                ('size_out_money_received','product_out_money_received','manual')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at  TIMESTAMPTZ NULL,
  settled_by  UUID NULL
);

CREATE INDEX ix_pod_partner_open
  ON public.partner_owner_debts (partner_id)
  WHERE settled_at IS NULL;

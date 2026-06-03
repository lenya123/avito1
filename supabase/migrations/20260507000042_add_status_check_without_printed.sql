-- ============================================================================
-- Объединение printed + collecting (шаг 3/3) — новый CHECK без 'printed'
-- ============================================================================

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'paid',
    'collecting',
    'sent',
    'return',
    'return_done',
    'trash',
    'cancelled',
    'problem'
  ));

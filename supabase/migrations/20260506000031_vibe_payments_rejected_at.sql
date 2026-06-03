-- Аудит отказов партнёра по +ВАЙБ-чеку.
-- Раньше «❌ Не пришли» от партнёра не оставлял следа: запись висела с
-- confirmed_at=NULL, не отличить от ожидающих. Теперь rejected_at
-- проставляется при отказе.

ALTER TABLE public.vibe_payments
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

COMMENT ON COLUMN public.vibe_payments.rejected_at IS
  'Партнёр (или владелец) отказал по этому чеку: деньги не пришли. Заказы остаются is_paid=false, клиент шлёт новый чек.';

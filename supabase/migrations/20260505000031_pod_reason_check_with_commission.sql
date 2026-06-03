-- Расширенный CHECK reason для partner_owner_debts. Добавили
-- 'partner_commission' — комиссия владельцу с обычного партнёрского заказа
-- (новая модель 2026-05-05: любой партнёрский = деньги партнёру → партнёр
-- должен мне комиссию по заказу). Записывается в confirm_pending_order_atomic.

ALTER TABLE public.partner_owner_debts
  ADD CONSTRAINT partner_owner_debts_reason_check
  CHECK (reason IN (
    'size_out_money_received',
    'product_out_money_received',
    'partner_commission',
    'manual'
  ));

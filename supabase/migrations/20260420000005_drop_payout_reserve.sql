-- Polish (P1 #10): drop dead column seller_payouts.reserve_amount
-- Нигде не записывается и не читается. Вернётся в ЮKassa Phase 4 как часть escrow.

ALTER TABLE public.seller_payouts DROP COLUMN IF EXISTS reserve_amount;

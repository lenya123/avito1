-- Откат Phase G.2: убираем статичные `partners.payment_requisites`.
--
-- BUSINESS_LOGIC §10.2 (per-order реквизиты): на каждый партнёрский заказ
-- партнёр шлёт свежие реквизиты в DM partner-bot, customer-bot форвардит
-- клиенту. Статичное поле в profile партнёра не нужно — поле просуществовало
-- ~1 день между Phase G.2 и этим откатом, в UI владельца оно не редактировалось,
-- так что данных в нём нет.

ALTER TABLE public.partners
  DROP COLUMN IF EXISTS payment_requisites;

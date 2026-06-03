-- 2026-05-26: финальная чистка дуал-реестра partner_owner_debts.
-- Триггер trg_partner_debt_on_vibe_payment писал reason='partner_commission'
-- в partner_owner_debts при is_paid=TRUE для partner-source +ВАЙБ-заказов.
-- Canonical commission-долг теперь считается из orders (§10.4) — таблица для
-- commission больше не учитывается в UI/API. Снимаем триггер чтобы не плодить
-- мёртвые данные.
DROP TRIGGER IF EXISTS trg_partner_debt_on_vibe_payment ON public.orders;

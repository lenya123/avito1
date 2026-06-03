-- Канон §9.6 ledger-модель ОТМЕНЕНА (решение пользователя 2026-05-18).
-- Была мёртвым кодом: триггер shipper_ledger_on_order_completed срабатывал
-- на статус 'completed', которого в каноне НЕТ (§4.2 — успешный терминал
-- = 'sent'). shipper_ledger_entries никогда не наполнялась →
-- /owner/payouts всегда пуст, build_shipper_payouts_for_period бесполезен.
-- Плюс латентная мина: триггер висел AFTER UPDATE OF status на ВСЕХ
-- заказах (как ранее ПВЗ-триггер, который ронял любой UPDATE).
--
-- Новая модель «выплаты»: владелец платит накопленный shipper_stats.
-- earnings и фиксирует факт в shipper_payouts (простой лог amount/note).
-- shipper_payouts / shipper_stats / shipper_score — ОСТАЮТСЯ.

-- 1. Триггер + функция авто-credit (мёртвый статус 'completed')
DROP TRIGGER IF EXISTS shipper_ledger_on_order_status_change ON public.orders;
DROP FUNCTION IF EXISTS public.shipper_ledger_on_order_completed();

-- 2. Период-выплаты RPC (ledger-only)
DROP FUNCTION IF EXISTS public.build_shipper_payouts_for_period(DATE, DATE);
DROP FUNCTION IF EXISTS public.mark_shipper_payout_paid(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.cancel_shipper_payout(UUID);

-- 3. Ledger-таблицы (CASCADE снимает RLS-политики и индексы)
DROP TABLE IF EXISTS public.shipper_payout_periods CASCADE;
DROP TABLE IF EXISTS public.shipper_ledger_entries CASCADE;

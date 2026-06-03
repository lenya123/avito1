-- Меняем return-shape approve_withdrawal_request — добавляем out_number
-- для удобного DM клиенту «#N закрыт». DROP + CREATE отдельными миграциями.
DROP FUNCTION IF EXISTS public.approve_withdrawal_request(UUID, UUID);

-- Меняем return-shape cancel_withdrawal_atomic — добавляем out_number
-- для DM и информационного уведомления владельцу.
DROP FUNCTION IF EXISTS public.cancel_withdrawal_atomic(UUID, UUID);

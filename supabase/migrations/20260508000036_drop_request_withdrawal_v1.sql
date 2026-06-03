-- Меняем return-shape RPC request_withdrawal_atomic — добавляется out_number.
-- Подменить через CREATE OR REPLACE нельзя (return type immutable),
-- поэтому DROP + CREATE отдельными миграциями.
DROP FUNCTION IF EXISTS public.request_withdrawal_atomic(UUID);

-- Stage 2.2 — Дроп осиротевших RPC, ссылавшихся на client_id / users.deposit.
--
-- users.deposit удалён ещё в Stage 1; функции UPDATE-или его и сейчас валятся
-- при вызове. Callers переписаны в Stage 2.2, RPC можно безопасно DROP.

DO $$
BEGIN
  -- increment_user_deposit — обе возможные сигнатуры.
  EXECUTE 'DROP FUNCTION IF EXISTS public.increment_user_deposit(UUID, NUMERIC) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.increment_user_deposit(UUID, INTEGER) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.increment_user_deposit(UUID, DECIMAL) CASCADE';
  -- decrement_user_deposit — симметрично.
  EXECUTE 'DROP FUNCTION IF EXISTS public.decrement_user_deposit(UUID, NUMERIC) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.decrement_user_deposit(UUID, INTEGER) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.decrement_user_deposit(UUID, DECIMAL) CASCADE';
  -- increment_referral_deposit — реф.программа вырезана в Stage 1.
  EXECUTE 'DROP FUNCTION IF EXISTS public.increment_referral_deposit(UUID, NUMERIC) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.increment_referral_deposit(UUID, DECIMAL) CASCADE';
  -- Триггер/функция last_order_at по client_id — мог остаться от 20260111000002.
  EXECUTE 'DROP TRIGGER IF EXISTS update_client_last_order ON public.orders';
  EXECUTE 'DROP FUNCTION IF EXISTS public.update_client_last_order() CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.update_client_last_order_at() CASCADE';
  -- Atomic RPC, ссылавшиеся на client_id — могут не существовать на этой инсталляции.
  EXECUTE 'DROP FUNCTION IF EXISTS public.cancel_order_atomic(UUID, TEXT) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.complete_order_atomic(UUID) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS public.return_order_atomic(UUID) CASCADE';
END
$$;

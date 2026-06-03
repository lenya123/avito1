-- Этап 1.5 — финальная чистка orphan RPC.
-- increment_referral_deposit был частью реферальной программы — зона, удалённая
-- в Stage 1. Функция осталась в DB, dропаем для чистоты `db:gen-types`.

DROP FUNCTION IF EXISTS public.increment_referral_deposit(UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.increment_referral_deposit(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.increment_referral_deposit(UUID, DECIMAL);

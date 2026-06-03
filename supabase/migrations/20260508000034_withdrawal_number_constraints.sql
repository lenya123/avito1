-- DEFAULT + NOT NULL + UNIQUE одной командой ALTER (комма-список — одно
-- top-level statement, безопасно для pooler'а).
ALTER TABLE public.withdrawal_requests
  ALTER COLUMN withdrawal_number SET DEFAULT nextval('public.withdrawal_number_seq'),
  ALTER COLUMN withdrawal_number SET NOT NULL,
  ADD CONSTRAINT withdrawal_requests_number_unique UNIQUE (withdrawal_number);

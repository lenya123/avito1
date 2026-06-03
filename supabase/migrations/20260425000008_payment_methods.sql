-- Stage 2.4 — Ферма платёжных карт + RPC ротации + stats.
--
-- Мотивация: массовый приём переводов от клиентов требует нескольких карт
-- (лимиты банков по месяцам). Карты/СБП номера хранятся plaintext под RLS
-- owner-only; обоснование в b2b-saas-generic-blum.md → "Номера карт".
--
-- Сценарий: при подтверждении заказа customer-bot зовёт RPC next_payment_method
-- → получает активный метод, у которого ещё есть месячный лимит, → подставляет
-- в шаблон реквизитов → шлёт клиенту. На AFTER INSERT vibe_payments запись
-- инкрементит payment_method_month_stats → следующий вызов уйдёт на другую
-- карту по ротации.

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('card', 'sbp', 'business_account')),
  label VARCHAR(100) NOT NULL,             -- "Тинькофф Лена", "ИП Сидоров"
  card_number_full VARCHAR(32),            -- для card, plaintext
  card_number_last4 VARCHAR(4),            -- вычисляется триггером
  holder_name VARCHAR(255),
  bank_name VARCHAR(100),
  sbp_phone VARCHAR(32),                   -- для sbp
  business_requisites JSONB,               -- для business_account (ИНН/КПП/р-с/БИК)
  monthly_limit NUMERIC(12, 2),            -- NULL = без лимита
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_active
  ON public.payment_methods(is_active, sort_order)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.payment_method_month_stats (
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  year_month CHAR(7) NOT NULL,             -- '2026-04'
  amount_used NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (payment_method_id, year_month)
);

-- ===== Триггер: card_number_last4 из card_number_full =====

CREATE OR REPLACE FUNCTION public.payment_methods_compute_last4()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF NEW.card_number_full IS NULL THEN
    NEW.card_number_last4 := NULL;
  ELSE
    v_clean := regexp_replace(NEW.card_number_full, '[^0-9]', '', 'g');
    IF char_length(v_clean) >= 4 THEN
      NEW.card_number_last4 := right(v_clean, 4);
    ELSE
      NEW.card_number_last4 := NULL;
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_methods_last4 ON public.payment_methods;
CREATE TRIGGER trg_payment_methods_last4
  BEFORE INSERT OR UPDATE OF card_number_full ON public.payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.payment_methods_compute_last4();

-- ===== FK из vibe_payments.payment_method_id (Stage 2.3 placeholder) =====

ALTER TABLE public.vibe_payments
  DROP CONSTRAINT IF EXISTS vibe_payments_payment_method_id_fkey;

ALTER TABLE public.vibe_payments
  ADD CONSTRAINT vibe_payments_payment_method_id_fkey
  FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;

-- ===== RPC: next_payment_method =====
--
-- Выбирает активный метод с достаточным остатком лимита. Сортировка:
-- business_account уходит в конец, затем sort_order ASC, id ASC.
-- Возврат: одна строка или NULL (если все методы исчерпали лимит).

CREATE OR REPLACE FUNCTION public.next_payment_method(p_amount NUMERIC)
RETURNS SETOF public.payment_methods
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.*
  FROM public.payment_methods pm
  LEFT JOIN public.payment_method_month_stats st
    ON st.payment_method_id = pm.id
    AND st.year_month = to_char(NOW(), 'YYYY-MM')
  WHERE pm.is_active = TRUE
    AND (pm.monthly_limit IS NULL
         OR COALESCE(st.amount_used, 0) + p_amount <= pm.monthly_limit)
  ORDER BY (pm.kind = 'business_account') ASC, pm.sort_order ASC, pm.id ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.next_payment_method IS
  'Возвращает следующую карту/реквизиты по ротации с учётом месячного лимита. ИП — последним.';

-- ===== Триггер: инкремент stats на INSERT vibe_payments =====

CREATE OR REPLACE FUNCTION public.vibe_payments_bump_method_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.payment_method_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.payment_method_month_stats (payment_method_id, year_month, amount_used, updated_at)
    VALUES (NEW.payment_method_id, to_char(NEW.received_at, 'YYYY-MM'), NEW.amount, NOW())
    ON CONFLICT (payment_method_id, year_month)
    DO UPDATE SET amount_used = public.payment_method_month_stats.amount_used + EXCLUDED.amount_used,
                  updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vibe_payments_bump_stats ON public.vibe_payments;
CREATE TRIGGER trg_vibe_payments_bump_stats
  AFTER INSERT ON public.vibe_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.vibe_payments_bump_method_stats();

-- ===== RLS =====

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_method_month_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_methods_owner_all ON public.payment_methods
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY payment_method_month_stats_owner_all ON public.payment_method_month_stats
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

REVOKE ALL ON public.payment_methods FROM anon;
REVOKE ALL ON public.payment_method_month_stats FROM anon;

COMMENT ON TABLE public.payment_methods IS
  'Ферма карт/СБП/реквизитов владельца. Plaintext-хранение оправдано single-tenant + owner-only RLS.';

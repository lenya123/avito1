-- Phase A.4 — Новые таблицы под механики из BUSINESS_LOGIC.md.
--
-- 1. customer_balance_history  — журнал движений customer_balance (§9.2).
-- 2. withdrawal_requests       — заявки клиентов на вывод денег с баланса (§9.2).
-- 3. trumpet_sessions          — нажатия «Протрубить возвраты» в shipper-PWA (§6.4).
-- 4. return_pickup_attempts    — попытки забора возврата на ПВЗ (§6.4, §6.6).

-- =====================================================================
-- 1. customer_balance_history
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.customer_balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- Дельта: положительная — пополнение, отрицательная — списание.
  delta NUMERIC(12, 2) NOT NULL CHECK (delta <> 0),
  balance_after NUMERIC(12, 2) NOT NULL CHECK (balance_after >= 0),

  -- Причина движения (BUSINESS_LOGIC §9.2):
  --   return_done           — возврат принят, заказ оплачен → +client_price
  --   cancelled_before_ship — заказ отменён до отправки, был оплачен → +client_price
  --   send_by_expired       — send_by сгорел, был оплачен → +client_price
  --   manual_credit         — владелец вручную «вернул N₽» (произвольный возврат)
  --   withdrawal            — клиент вывел деньги (списание после ручного перевода владельца)
  reason TEXT NOT NULL CHECK (reason IN (
    'return_done',
    'cancelled_before_ship',
    'send_by_expired',
    'manual_credit',
    'withdrawal'
  )),

  -- Привязка: либо к заказу (auto-credit), либо к withdrawal-запросу (списание),
  -- либо ручная операция владельца (NULL/NULL + actor_user_id).
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  withdrawal_request_id UUID,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_history_customer
  ON public.customer_balance_history(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_history_order
  ON public.customer_balance_history(order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.customer_balance_history ENABLE ROW LEVEL SECURITY;

-- Owner/admin видят и пишут всё. Customer-bot ходит под service_role.
CREATE POLICY customer_balance_history_owner_all ON public.customer_balance_history
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

COMMENT ON TABLE public.customer_balance_history IS
  'Журнал движений customer_balance (BUSINESS_LOGIC §9.2). Никогда не удалять — только append.';

-- =====================================================================
-- 2. withdrawal_requests
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),

  -- pending → done: владелец перевёл деньги вне системы и нажал «Списать с баланса».
  -- pending → cancelled: владелец отменил (например, клиент попросил).
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Один pending-запрос на клиента — повторный «Запросить вывод» недоступен пока висит pending.
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_one_pending_per_customer
  ON public.withdrawal_requests(customer_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_customer
  ON public.withdrawal_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status
  ON public.withdrawal_requests(status, created_at DESC);

-- FK от customer_balance_history.withdrawal_request_id (только сейчас, когда таблица создана)
ALTER TABLE public.customer_balance_history
  DROP CONSTRAINT IF EXISTS customer_balance_history_withdrawal_fk;
ALTER TABLE public.customer_balance_history
  ADD CONSTRAINT customer_balance_history_withdrawal_fk
  FOREIGN KEY (withdrawal_request_id) REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY withdrawal_requests_owner_all ON public.withdrawal_requests
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

COMMENT ON TABLE public.withdrawal_requests IS
  'Заявки клиентов на вывод customer_balance (BUSINESS_LOGIC §9.2). Уникальный pending на клиента — кнопка «Запросить вывод» неактивна пока висит запрос.';

-- =====================================================================
-- 3. trumpet_sessions
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.trumpet_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Один день = одна сессия на весь магазин (single-tenant).
  -- Лимит 1 раз/день обеспечивается уникальным индексом по date.
  trumpet_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Europe/Moscow')::DATE,

  -- Кто протрубил.
  triggered_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Кто отменил (если отменили).
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Один активный (не отменённый) trumpet на день.
CREATE UNIQUE INDEX IF NOT EXISTS trumpet_sessions_one_per_day
  ON public.trumpet_sessions(trumpet_date)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.trumpet_sessions ENABLE ROW LEVEL SECURITY;

-- Shipper и owner — видят и могут создавать.
CREATE POLICY trumpet_sessions_select ON public.trumpet_sessions
  FOR SELECT TO authenticated
  USING (public.is_shipper() OR public.is_owner());

CREATE POLICY trumpet_sessions_insert ON public.trumpet_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_shipper() OR public.is_owner());

CREATE POLICY trumpet_sessions_update ON public.trumpet_sessions
  FOR UPDATE TO authenticated
  USING (public.is_shipper() OR public.is_owner())
  WITH CHECK (public.is_shipper() OR public.is_owner());

COMMENT ON TABLE public.trumpet_sessions IS
  'Сессии «Протрубить возвраты» из shipper-PWA (BUSINESS_LOGIC §6.4). Один тромбон на день на весь магазин. Если cancelled_at NOT NULL — отменена.';

-- =====================================================================
-- 4. return_pickup_attempts
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.return_pickup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  trumpet_session_id UUID REFERENCES public.trumpet_sessions(id) ON DELETE SET NULL,

  -- Дата попытки (МСК). Для адаптивных порогов §6.6 считаем уникальные дни.
  attempt_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Europe/Moscow')::DATE,

  -- Результат: NULL → попытка засчитана но без визита/без отметки на ПВЗ.
  -- 'wrong_code'     — клиент должен прислать новый код возврата
  -- 'wrong_tracking' — клиент должен прислать новый трек
  -- 'not_found'      — посылка не доехала до ПВЗ (попытка засчитывается)
  -- 'picked_up'      — забран и в порядке (см. status → return_done)
  result TEXT CHECK (result IS NULL OR result IN ('wrong_code', 'wrong_tracking', 'not_found', 'picked_up')),

  attempted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

-- Одна попытка на (заказ, день) — нельзя дважды протрубить за один день по одному заказу.
CREATE UNIQUE INDEX IF NOT EXISTS return_pickup_attempts_unique_per_day
  ON public.return_pickup_attempts(order_id, attempt_date);

CREATE INDEX IF NOT EXISTS idx_return_pickup_attempts_order
  ON public.return_pickup_attempts(order_id, attempt_date DESC);
CREATE INDEX IF NOT EXISTS idx_return_pickup_attempts_session
  ON public.return_pickup_attempts(trumpet_session_id)
  WHERE trumpet_session_id IS NOT NULL;

ALTER TABLE public.return_pickup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY return_pickup_attempts_select ON public.return_pickup_attempts
  FOR SELECT TO authenticated
  USING (public.is_shipper() OR public.is_owner());

CREATE POLICY return_pickup_attempts_modify ON public.return_pickup_attempts
  FOR ALL TO authenticated
  USING (public.is_shipper() OR public.is_owner())
  WITH CHECK (public.is_shipper() OR public.is_owner());

COMMENT ON TABLE public.return_pickup_attempts IS
  'Попытки забора возврата на ПВЗ (BUSINESS_LOGIC §6.4, §6.6). NULL result = trumpet нажат но визита/отметки не было. Адаптивные пороги используют COUNT уникальных дней.';

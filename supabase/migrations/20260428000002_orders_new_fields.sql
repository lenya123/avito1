-- Phase A.2 — Новые поля на orders по канону BUSINESS_LOGIC.md.
--
-- send_by              — DATE, дедлайн отгрузки (клиент задаёт inline-календарём)
-- pickup_by            — DATE, дедлайн забора возврата (клиент при оформлении возврата)
-- assigned_shipper_id  — UUID, кто взял заказ в работу
--                       (NULL пока paid; FK после collecting; история после sent/return_done/trash)
-- fault_party          — TEXT, кто виноват при сгорании возврата ('platform' | 'client')
-- fault_reason         — TEXT, причина (no_attempts | wrong_data | no_response | late_report)
-- return_window_days   — INT, окно от создания возврата до pickup_by (для адаптивных порогов §6.6)
-- return_attempts_count — INT, счётчик циклов возврата (лимит 2: оформил → отменил → переоткрыл)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS send_by DATE,
  ADD COLUMN IF NOT EXISTS pickup_by DATE,
  ADD COLUMN IF NOT EXISTS assigned_shipper_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fault_party TEXT,
  ADD COLUMN IF NOT EXISTS fault_reason TEXT,
  ADD COLUMN IF NOT EXISTS return_window_days INT,
  ADD COLUMN IF NOT EXISTS return_attempts_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fault_party_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fault_party_check
  CHECK (fault_party IS NULL OR fault_party IN ('platform', 'client'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fault_reason_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fault_reason_check
  CHECK (fault_reason IS NULL OR fault_reason IN ('no_attempts', 'wrong_data', 'no_response', 'late_report'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_return_attempts_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_return_attempts_check
  CHECK (return_attempts_count BETWEEN 0 AND 2);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_orders_send_by
  ON public.orders(send_by)
  WHERE status IN ('paid', 'collecting', 'printed', 'problem');

CREATE INDEX IF NOT EXISTS idx_orders_pickup_by
  ON public.orders(pickup_by)
  WHERE status = 'return';

CREATE INDEX IF NOT EXISTS idx_orders_assigned_shipper
  ON public.orders(assigned_shipper_id)
  WHERE assigned_shipper_id IS NOT NULL;

COMMENT ON COLUMN public.orders.send_by IS
  'Срок отгрузки (BUSINESS_LOGIC §4.5). Клиент задаёт inline-календарём. По истечении заказ → cancelled, баланс пополняется.';
COMMENT ON COLUMN public.orders.pickup_by IS
  'Срок забора возврата (BUSINESS_LOGIC §4.5). Клиент задаёт inline-календарём при оформлении возврата. По истечении → trash + расчёт fault.';
COMMENT ON COLUMN public.orders.assigned_shipper_id IS
  'NULL для paid (общий пул); FK на shipper-а в collecting/printed; исторический в sent/return_done/trash.';
COMMENT ON COLUMN public.orders.fault_party IS
  'Чья вина при сгорании возврата (BUSINESS_LOGIC §6.6): platform | client. Только для KPI отправщика, на финансы не влияет.';
COMMENT ON COLUMN public.orders.fault_reason IS
  'Деталь fault_party: no_attempts | wrong_data | no_response | late_report.';
COMMENT ON COLUMN public.orders.return_window_days IS
  'Окно (pickup_by - дата_оформления_возврата) в днях. Используется для адаптивных порогов попыток (BUSINESS_LOGIC §6.6).';
COMMENT ON COLUMN public.orders.return_attempts_count IS
  'Счётчик циклов возврата. Лимит 2 (оформил → отменил → переоткрыл из trash). 3-й невозможен.';

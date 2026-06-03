-- Этап 4: поля Vision-распознавания в pending_orders для multi-signal проверки.
-- Заполняются handler'ом recognize-pending-receipt после анализа фото чека.

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS vision_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_ip_name TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_bank TEXT,
  ADD COLUMN IF NOT EXISTS vision_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS vision_datetime TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vision_is_proper_receipt BOOLEAN,
  ADD COLUMN IF NOT EXISTS vision_raw_text TEXT,
  ADD COLUMN IF NOT EXISTS receipt_attempts INT NOT NULL DEFAULT 0;

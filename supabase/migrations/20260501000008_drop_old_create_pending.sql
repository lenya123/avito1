-- Удаляем старую сигнатуру (без DEFAULT для p_partner_id), чтобы потом
-- создать новую с partner_id опциональным.
DROP FUNCTION IF EXISTS public.create_pending_order_atomic(
  UUID, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, DATE, INTEGER
);

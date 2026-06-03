-- Walkthrough фазы 2 (#3 пересылка чека-фото в карточку заказа):
-- единый API для получения списка чеков заказа из обоих источников
-- сохранения.
--
-- Модель: чек прикреплён к ОПЛАТЕ, не к заказу. Два места хранения:
--   1. Прямая оплата — orders.receipt_storage_path (один заказ = один чек).
--   2. +ВАЙБ-погашение — vibe_payments.receipt_file_url, связан с
--      заказом через linkage vibe_payment_orders. Один vibe_payment
--      может погасить N заказов, на один заказ может прийтись несколько
--      vibe-payments (если клиент закрывает долг частями).
--
-- Имя поля `vibe_payments.receipt_file_url` legacy и вводит в
-- заблуждение — там фактически хранится storage_path в том же bucket
-- `receipts` (см. recognize-receipt.ts:80, data.filePath).
COMMENT ON COLUMN public.vibe_payments.receipt_file_url IS
  'Storage path в bucket "receipts" (НЕ URL, несмотря на имя). Legacy-имя — мигрировать вместе с переименованием опасно; читать как path и подавать через storage.createSignedUrl.';

CREATE OR REPLACE FUNCTION public.get_order_receipts(p_order_id UUID)
RETURNS TABLE (
  storage_path TEXT,
  received_at TIMESTAMPTZ,
  source TEXT,
  vibe_payment_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    receipt_storage_path AS storage_path,
    COALESCE(updated_at, created_at) AS received_at,
    'direct'::TEXT AS source,
    NULL::UUID AS vibe_payment_id
  FROM public.orders
  WHERE id = p_order_id
    AND receipt_storage_path IS NOT NULL

  UNION ALL

  SELECT
    vp.receipt_file_url AS storage_path,
    COALESCE(vp.confirmed_at, vp.received_at) AS received_at,
    'vibe'::TEXT AS source,
    vp.id AS vibe_payment_id
  FROM public.vibe_payment_orders vpo
  JOIN public.vibe_payments vp ON vp.id = vpo.vibe_payment_id
  WHERE vpo.order_id = p_order_id
    AND vp.receipt_file_url IS NOT NULL
    AND vp.rejected_at IS NULL

  ORDER BY received_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_receipts(UUID) TO service_role;

COMMENT ON FUNCTION public.get_order_receipts IS
  'Возвращает все чеки заказа из orders.receipt_storage_path (прямые оплаты) и vibe_payments через linkage vibe_payment_orders. Порядок — хронологический. Используется в customer-bot openOrderCard для пересылки клиенту фото-чека внутри карточки.';

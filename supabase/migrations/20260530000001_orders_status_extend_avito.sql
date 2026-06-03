-- ============================================================================
-- ТЗ Авито-заказы (§5.1): расширяем OrderStatus для Авито-веток.
--
-- Добавляем три статуса, используемые только при source='avito':
--   awaiting_size      — заказ создан, размер неизвестен, мини-AI его уточняет
--   delivered          — покупатель забрал из ПВЗ (терминальный успех для Авито)
--   return_in_transit  — возврат покупателя в пути на ПВЗ (с expected_return_date)
--
-- State machine дроп-заказа эти статусы не использует.
-- ============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check,
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'paid',
    'collecting',
    'sent',
    'return',
    'return_done',
    'trash',
    'cancelled',
    'problem',
    'awaiting_size',
    'delivered',
    'return_in_transit'
  ));

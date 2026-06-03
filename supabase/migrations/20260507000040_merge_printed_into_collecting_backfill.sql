-- ============================================================================
-- Объединение статусов printed + collecting в один статус collecting
-- ============================================================================
-- Решение walkthrough'а 2026-05-07: печать стикера — внутрянка отправщика,
-- не отдельный статус. У collecting уже есть полночный auto-revert через
-- daily-shipper-cleanup, дополнительная логика не нужна.
--
-- Шаг 1/2 (backfill). Все строки status='printed' переводятся в collecting.
-- Флаг barcode_printed=true сохраняется как факт «стикер был распечатан»,
-- использовать как timestamp barcode_printed_at для аналитики.

UPDATE public.orders
SET status = 'collecting'
WHERE status = 'printed';

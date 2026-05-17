-- =============================================================================
-- Обогащение avito_orders под ТЗ: какая объява, код возврата, тег источника.
--
-- Web-эндпоинт Avito Доставки не отдаёт явно id объявления и код возврата в
-- разобранной структуре — связываем эвристически в sync-джобе (// STUB).
-- source_tag = «заказ с авито» — для отдельной страницы панели владельца.
-- =============================================================================
ALTER TABLE avito_orders
  ADD COLUMN IF NOT EXISTS avito_item_id TEXT,                 -- по какой объяве
  ADD COLUMN IF NOT EXISTS return_code   TEXT,                 -- код возврата
  ADD COLUMN IF NOT EXISTS source_tag    TEXT NOT NULL DEFAULT 'avito';

CREATE INDEX IF NOT EXISTS avito_orders_item_idx
  ON avito_orders(session_id, avito_item_id);

COMMENT ON COLUMN avito_orders.avito_item_id IS
  'ID объявления Avito (эвристическая связка по заголовку — STUB до интеграции).';
COMMENT ON COLUMN avito_orders.return_code IS
  'Код возврата при возврате (эвристика из info/status — STUB).';
COMMENT ON COLUMN avito_orders.source_tag IS
  'Тег источника для страницы панели владельца: «заказ с авито».';

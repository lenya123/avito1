-- Индекс под выборку pending-генераций по товару.
CREATE INDEX IF NOT EXISTS avito_ai_generations_pending
  ON avito_ai_generations (status, product_id);

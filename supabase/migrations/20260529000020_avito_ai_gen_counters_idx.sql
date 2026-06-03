-- Индекс под лукап остатка квоты дня по товару.
CREATE INDEX IF NOT EXISTS avito_ai_gen_counters_lookup
  ON avito_ai_gen_counters (product_id, gen_date);

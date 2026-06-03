-- Индекс под выбор наименее использованного фотосета.
CREATE INDEX IF NOT EXISTS avito_photoset_sets_ladder_idx
  ON avito_photoset_sets (user_id, is_active, usage_count, last_used_at);

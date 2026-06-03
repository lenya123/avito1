-- Индекс под выбор наименее использованного пресета по виду.
CREATE INDEX IF NOT EXISTS avito_media_presets_ladder_idx
  ON avito_media_presets (user_id, kind, is_active, usage_count, last_used_at);

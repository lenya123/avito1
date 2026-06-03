-- Расширяем CHECK на avito_media_presets.kind: рантайм-таблица создавалась
-- со старым набором ('cover','photoset'); новая фича добавляет виды
-- preview / photozone / personality / ai-preview. Одна команда (DROP+ADD
-- в одном ALTER), идемпотентно (DROP IF EXISTS перед ADD).
ALTER TABLE avito_media_presets
  DROP CONSTRAINT IF EXISTS avito_media_presets_kind_check,
  ADD CONSTRAINT avito_media_presets_kind_check
    CHECK (kind = ANY (ARRAY['cover','photoset','preview','photozone','personality','ai-preview']::text[]));

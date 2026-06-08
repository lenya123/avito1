-- avito_items: UNIQUE(user_id, avito_item_id) → UNIQUE(session_id, avito_item_id).
-- Мультиаккаунт: два акка одного юзера не должны мёрджиться по общему item_id.
-- Применено вживую через Supabase Management API 2026-06-08; файл идемпотентен
-- (DO-блок = одна команда для пулера), безопасен на свежей и уже-мигрированной БД.
DO $$
BEGIN
  ALTER TABLE avito_items DROP CONSTRAINT IF EXISTS avito_items_user_id_avito_item_id_key;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'avito_items_session_item_key'
  ) THEN
    ALTER TABLE avito_items
      ADD CONSTRAINT avito_items_session_item_key UNIQUE (session_id, avito_item_id);
  END IF;
END $$;

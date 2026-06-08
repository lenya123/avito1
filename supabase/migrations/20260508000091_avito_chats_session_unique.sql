-- avito_chats: UNIQUE(user_id, avito_chat_id) → UNIQUE(session_id, avito_chat_id).
-- Мультиаккаунт: чаты двух акков одного юзера не должны мёрджиться по chat_id.
-- Применено вживую через Supabase Management API 2026-06-08; идемпотентно (DO-блок).
DO $$
BEGIN
  ALTER TABLE avito_chats DROP CONSTRAINT IF EXISTS avito_chats_user_id_avito_chat_id_key;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'avito_chats_session_chat_key'
  ) THEN
    ALTER TABLE avito_chats
      ADD CONSTRAINT avito_chats_session_chat_key UNIQUE (session_id, avito_chat_id);
  END IF;
END $$;

-- Партнёр не в таблице users — для партнёрских trumpet-сессий triggered_by
-- остаётся NULL, идентификация триггера через partner_id.
ALTER TABLE public.trumpet_sessions
  ALTER COLUMN triggered_by DROP NOT NULL;

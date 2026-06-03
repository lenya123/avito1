-- Walkthrough partner-bot: партнёр может «протрубить» свои возвраты.
-- Расширяем trumpet_sessions: одна сессия в день на партнёра в дополнение к
-- одной общей (от отправщика владельца).
ALTER TABLE public.trumpet_sessions
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE;

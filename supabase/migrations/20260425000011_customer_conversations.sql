-- Stage 2.5 — История диалогов клиента (для AI-менеджера, Stage 6).
--
-- Каждая реплика: кто сказал (user/assistant/human_owner), контент, метаданные
-- вызова модели (tokens, model, tool_calls). Используется для передачи контекста
-- в LLM при следующем обращении клиента.

CREATE TABLE IF NOT EXISTS public.customer_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tg_chat_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'human_owner')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_conversations_customer
  ON public.customer_conversations(customer_id, created_at DESC);

ALTER TABLE public.customer_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_conversations_owner_all ON public.customer_conversations
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

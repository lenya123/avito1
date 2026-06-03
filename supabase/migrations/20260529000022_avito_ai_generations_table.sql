-- Pending-состояние AI-генерации фото для подтверждения в owner-bot.
-- status: pending → approved | rejected | regenerating.
CREATE TABLE IF NOT EXISTS avito_ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  category text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  storage_path text NOT NULL,
  public_url text,
  reference_preset_id uuid REFERENCES public.avito_media_presets(id),
  source_photoset_set_key text,
  prompt text,
  tg_chat_id bigint,
  tg_message_id bigint,
  attempt int NOT NULL DEFAULT 1,
  approved_preset_id uuid REFERENCES public.avito_media_presets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

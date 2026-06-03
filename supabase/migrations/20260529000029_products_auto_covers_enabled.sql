-- Per-товар флаг ночной автогенерации AI-обложек (Q3 «только выбранные»).
ALTER TABLE products ADD COLUMN IF NOT EXISTS auto_covers_enabled boolean NOT NULL DEFAULT false;

-- Ручной выбор фотосета для выкладки (NULL = авто/лестница).
ALTER TABLE avito_post_jobs ADD COLUMN IF NOT EXISTS manual_set_key text;

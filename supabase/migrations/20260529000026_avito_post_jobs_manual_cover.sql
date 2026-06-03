-- Ручной выбор обложки для выкладки (NULL = авто/лестница).
ALTER TABLE avito_post_jobs ADD COLUMN IF NOT EXISTS manual_cover_preset_id uuid REFERENCES public.avito_media_presets(id);

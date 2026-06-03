-- Живой фотосет («датасет») принадлежит товару: фотосеты per-product.
-- avito_media_presets уже имеет product_id; здесь добавляем его в album-таблицу.
-- product_id NULL = легаси/глобальный сет. Идемпотентно.
ALTER TABLE avito_photoset_sets ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id);

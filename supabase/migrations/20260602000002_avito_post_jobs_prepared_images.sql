-- Предзаготовленные фото выкладки: уникализируем 10 фото СИНХРОННО в POST (UI ждёт
-- «уникализируем…» до «успешно»), заливаем в сторадж и кладём сюда; воркер берёт их
-- вместо повторного mixPhotos. Форма: { paths:string[], coverPresetId, photosetSetKey,
-- plan, coverGenerated }. NULL → старый путь (воркер сам микширует).
ALTER TABLE avito_post_jobs ADD COLUMN IF NOT EXISTS prepared_images jsonb;

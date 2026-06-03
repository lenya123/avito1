-- Каталог-канал в Telegram (фаза 1, шаг #7).
--
-- Канал-broadcast для постинга карточек товаров. Постит customer-bot
-- (он же используется для группы заказов) — должен быть админом канала.
-- Постинг запускается из /owner/products/[id] кнопкой «Опубликовать»,
-- никаких автоматических триггеров на создание/ресток.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS catalog_channel_id TEXT;

COMMENT ON COLUMN public.business_settings.catalog_channel_id IS
  'Telegram chat_id канала-каталога (например -1001234567890). Customer-bot должен быть админом. NULL = постинг отключён.';

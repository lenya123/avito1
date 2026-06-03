-- Stage 3.2 — поля для выбора ПВЗ клиентом в customer-bot.
--
-- Клиент в боте вводит город и адрес/код ПВЗ свободным текстом (см. план
-- раздел I — интеграций с API СДЭК/Почты не делаем в Stage 3). Отправщик
-- при сборке ориентируется на эти два поля; общая таблица pickup_points
-- планируется к удалению в Stage 7, связь orders.pickup_point_id остаётся,
-- но новые клиентские заказы используют текстовые поля.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_delivery_city VARCHAR(120),
  ADD COLUMN IF NOT EXISTS customer_delivery_point_text TEXT;

COMMENT ON COLUMN public.orders.customer_delivery_city IS
  'Город доставки, введённый клиентом в customer-bot (свободный текст).';
COMMENT ON COLUMN public.orders.customer_delivery_point_text IS
  'Адрес или код ПВЗ, введённый клиентом в customer-bot (свободный текст).';

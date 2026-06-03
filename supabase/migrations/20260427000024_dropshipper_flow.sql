-- Stage 3.12 — переход на dropshipper-flow в customer-bot.
--
-- Решение владельца 2026-04-27 (после старта Stage 3 smoke):
-- клиенты в этом проекте — дропшипперы, перепродающие на Авито. Авито
-- Доставка автоматически создаёт отправление и выдаёт трек — нам нужен
-- только трек-номер. Адрес/город/ПВЗ конечного получателя в системе
-- не хранятся.
--
-- Wizard customer-bot теперь: товар → размер → служба доставки → трек →
-- оплата. Никаких городов клиента и текстовых ПВЗ.
--
-- ПВЗ остаются только у отправщика (`shipper_pickup_points`) для возвратов.

-- 1. Дропаем поля, которые клиент больше НЕ заполняет.
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS customer_delivery_city,
  DROP COLUMN IF EXISTS customer_delivery_point_text;

-- 2. Город отправки товара. Заполняется при создании товара (дефолт берётся
-- из business_settings.default_dispatch_city, см. ниже). Видим клиенту в
-- боте при оформлении (только информативно).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dispatch_city VARCHAR(120);

COMMENT ON COLUMN public.products.dispatch_city IS
  'Город отправки товара. По дефолту берётся из business_settings.default_dispatch_city, можно переопределить на конкретном товаре.';

-- 3. Базовый город отправки в настройках владельца.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS default_dispatch_city VARCHAR(120);

COMMENT ON COLUMN public.business_settings.default_dispatch_city IS
  'Базовый город отправки. Подставляется по умолчанию в products.dispatch_city при создании нового товара.';

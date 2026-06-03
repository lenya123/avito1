-- Добавляем колонку deleted_at для soft-delete товаров
-- NULL = товар не удалён, timestamp = удалён
ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Индекс для быстрой фильтрации неудалённых товаров
CREATE INDEX idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NULL;

-- Разрешить товары без размеров (аксессуары, сумки и т.д.)
-- Если product_sizes для товара нет — заказ создаётся без размера

ALTER TABLE orders ALTER COLUMN product_size_id DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN size DROP NOT NULL;

-- Типизация проблем заказов: out_of_stock и bad_barcode
-- out_of_stock — нет в наличии при сборке (можно привязать возврат)
-- bad_barcode — штрихкод не работает при отправке (клиент исправляет или отменяет)

ALTER TABLE orders ADD COLUMN problem_type TEXT
  CHECK (problem_type IN ('out_of_stock', 'bad_barcode'));

ALTER TABLE orders ADD COLUMN linked_return_order_id UUID REFERENCES orders(id);

-- Индекс для быстрого поиска problem-заказов, привязанных к возвратам
CREATE INDEX idx_orders_problem_linked ON orders(linked_return_order_id)
  WHERE status = 'problem' AND problem_type = 'out_of_stock';

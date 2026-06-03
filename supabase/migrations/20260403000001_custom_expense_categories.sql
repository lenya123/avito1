-- Убираем захардкоженный CHECK на категории расходов
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

-- Таблица пользовательских категорий расходов
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT 'accent-orange',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access" ON expense_categories FOR ALL USING (true);

-- Дефолтные категории
INSERT INTO expense_categories (name, color, sort_order) VALUES
  ('Закупка товара', 'accent-orange', 0),
  ('Доставка', 'accent-blue', 1),
  ('Упаковка', 'accent-teal', 2),
  ('Реклама', 'accent-purple', 3),
  ('Подписки', 'accent-indigo', 4),
  ('Аренда', 'accent-pink', 5),
  ('Связь', 'accent-green', 6),
  ('Прочее', 'accent-red', 7)
ON CONFLICT (name) DO NOTHING;

-- Статистика за сегодня для отображения "(+N сегодня)" в карточках
ALTER TABLE avito_items
  ADD COLUMN IF NOT EXISTS views_today INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorites_today INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contacts_today INT DEFAULT 0;

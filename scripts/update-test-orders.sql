-- Обновляем total_completed_orders для тестовых пользователей
-- в соответствии с их уровнем (для корректного отображения прогресса)

-- Уровень 0: 0-14 заказов → ставим 5 (прогресс ~33%)
UPDATE users
SET total_completed_orders = 5
WHERE level = 0 AND role = 'client';

-- Уровень 1: 15-29 заказов → ставим 22 (прогресс ~47%)
UPDATE users
SET total_completed_orders = 22
WHERE level = 1 AND role = 'client';

-- Уровень 2: 30-49 заказов → ставим 40 (прогресс ~50%)
UPDATE users
SET total_completed_orders = 40
WHERE level = 2 AND role = 'client';

-- Уровень 3: 50+ заказов → ставим 55 (максимальный уровень)
UPDATE users
SET total_completed_orders = 55
WHERE level = 3 AND role = 'client';

-- Проверяем результат
SELECT name, level, total_completed_orders, is_vibe_plus
FROM users
WHERE role = 'client'
ORDER BY level;

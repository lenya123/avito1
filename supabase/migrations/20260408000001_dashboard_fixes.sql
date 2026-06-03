-- Добавляем настройку месячной цели по прибыли для дашборда владельца
ALTER TABLE settings ADD COLUMN IF NOT EXISTS monthly_profit_target INTEGER DEFAULT 500000;

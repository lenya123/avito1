-- Старый UNIQUE блокирует параллельные сессии на разных партнёров.
-- Заменяем на два partial-индекса (owner-side + partner-side).
DROP INDEX IF EXISTS public.trumpet_sessions_one_per_day;

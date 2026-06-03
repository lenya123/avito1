-- Функцию каскада тоже сносим — её больше не вызывает ни один триггер
-- (см. предыдущую миграцию 20260526000030). Логика теперь в коде:
-- src/lib/orders/shipper-actions.ts → executeMarkProblem.
DROP FUNCTION IF EXISTS public.cascade_problem_orders();

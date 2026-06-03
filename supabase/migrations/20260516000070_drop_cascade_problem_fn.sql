-- Парная к 20260516000060: убираем осиротевшую функцию каскада.
-- Канон §11.1 — без каскада problem/out_of_stock. Триггер уже снят.
DROP FUNCTION IF EXISTS public.cascade_problem_orders();

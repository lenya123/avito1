-- Канон §11.2: каскад «нет товара → все остальные активные на тот же
-- размер» переехал из БД-триггера в код приложения (executeMarkProblem).
-- Причина: отправщик теперь выбирает scope ('single' vs 'all') —
-- триггер этот выбор не видит. Логика каскада в коде проще для отладки
-- и явно отделяет «обнулить размер» от «каскадить остальные заказы».
-- pg_notify-триггер notify_size_quantity_restored оставлен (memory:
-- LISTEN мёртв, реальный механизм — явный scheduleAutoResumeProblem;
-- но триггер безвреден).
DROP TRIGGER IF EXISTS trg_orders_cascade_problem ON public.orders;

-- Канон §11.1 (переписан 2026-05-15): пометка заказа problem/out_of_stock
-- делается ТОЛЬКО для текущего заказа. Каскада на остальные активные заказы
-- того же product_size_id НЕТ — «нехватка одной единицы не означает что
-- товара нет вообще». TS-код (shipper-actions executeMarkProblem) уже по
-- новому канону. Live-триггер trg_orders_cascade_problem (Phase H, 29.04)
-- молча переводил ВСЕ paid/collecting заказы размера в problem и обнулял
-- current_quantity — прямое противоречие §11.1. Дроп триггера; функция
-- удаляется отдельной миграцией. notify_size_quantity_restored (§11.3
-- auto-resume) НЕ трогаем — она в том же файле миграции, но нужна.
DROP TRIGGER IF EXISTS trg_orders_cascade_problem ON public.orders;

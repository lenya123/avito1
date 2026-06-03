-- Walkthrough #5 follow-up: короткий номер для каждого запроса вывода.
-- Используется в DM владельцу — он отвечает «N да/нет» текстом, как с
-- партнёрскими чеками. Защита от случайного нажатия кнопки.
CREATE SEQUENCE IF NOT EXISTS public.withdrawal_number_seq AS INTEGER START WITH 1 MINVALUE 1;

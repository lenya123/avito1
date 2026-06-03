-- Stage 2 — чистка рудимента витрины.
--
-- business_bio был заложен из старой B2C-модели с клиентским сайтом и
-- публичной витриной магазина. В B2B SaaS-коробке клиентского сайта нет,
-- описание магазина никем не читается.
--
-- Оставляем business_name (нужен customer-bot в Stage 3) и
-- payment_requisites_message (используется customer-bot в Stage 3,
-- значение задаёт разработчик при установке через SQL).

ALTER TABLE public.business_settings DROP COLUMN IF EXISTS business_bio;

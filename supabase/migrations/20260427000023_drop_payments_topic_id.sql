-- Удаляем мёртвую колонку payments_topic_id из business_settings.
--
-- История: добавлена в миграции 20260425000021 для постинга чеков в топик
-- «Оплаты» внутри клиентской группы (вместе с заказами). После архитектурного
-- решения 2026-04-27 чеки переехали в отдельную приватную группу «ЧЕКИ»
-- (env: TELEGRAM_RECEIPTS_GROUP_ID), без топиков. Колонка больше не читается
-- кодом (см. src/lib/telegram/orders-group.ts → getTopicIds).

ALTER TABLE public.business_settings
  DROP COLUMN IF EXISTS payments_topic_id;

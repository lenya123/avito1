-- Подготовка к расширению CHECK reason в partner_owner_debts.
-- Дропаем старое ограничение, чтобы следующей миграцией добавить
-- новое значение 'partner_commission' (долг по комиссии за обычный
-- partner-source заказ).
-- Pooler не даёт DROP+ADD constraint в одной транзакции — два файла.

ALTER TABLE public.partner_owner_debts
  DROP CONSTRAINT IF EXISTS partner_owner_debts_reason_check;

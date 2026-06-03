-- Запрет на NULL в orders.send_by — гарантия, что дыра «заказ без
-- даты отправки» больше не вернётся: ни один insert/update не пройдёт
-- без явного значения. Sweep / expire-send-by теперь могут не
-- беспокоиться про NULL-кейс.
ALTER TABLE orders ALTER COLUMN send_by SET NOT NULL;

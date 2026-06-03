-- Получатель ночной пачки AI-обложек в Telegram (chat_id того, кто создал товар;
-- NULL = слать владельцу проекта по умолчанию).
ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_tg_chat_id bigint;

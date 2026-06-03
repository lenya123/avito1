-- partner_stock_location на products: где физически лежит партнёрский товар.
--   - 'partner_warehouse' (default) — у партнёра, отправляет партнёр сам,
--     клиент платит партнёру по его реквизитам, Vision не запускается.
--   - 'owner_warehouse'             — у владельца, отправляет отправщик
--     владельца через PWA, клиент платит владельцу через payment_methods,
--     Vision auto-confirm. Владелец будет должен партнёру (client_price −
--     partner_commission), учёт долга — отдельная задача.
--
-- Поле смыслово применимо только к товарам с partner_id IS NOT NULL.
-- Для собственных товаров значение всегда 'partner_warehouse' по дефолту,
-- но логика игнорирует его (см. ветвления в customer-bot и shipper API).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS partner_stock_location TEXT NOT NULL
    DEFAULT 'partner_warehouse'
    CHECK (partner_stock_location IN ('partner_warehouse', 'owner_warehouse'));

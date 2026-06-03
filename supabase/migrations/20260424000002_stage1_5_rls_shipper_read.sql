-- Этап 1.5 — возвращаем SELECT-политики на products/product_sizes.
--
-- Контекст: миграция 20260423000005 (stage1 helpers) дропнула
-- is_premium_client() CASCADE — вместе с ним упали политики
-- products_select и product_sizes_select, которые ссылались на эту
-- функцию. После stage1 на products остался только products_modify_owner
-- (FOR ALL с USING is_owner()), который покрывает SELECT только для
-- owner/admin. Отправщик через authenticated контекст не видит каталог
-- и размеры. В prod сейчас API ходит через service_role (RLS обходится),
-- но это мина на будущее — PWA отправщика в authenticated-режиме получит
-- пустой склад.
--
-- is_shipper() после stage1 возвращает TRUE для shipper/owner/admin —
-- одна политика покрывает всех троих.

DROP POLICY IF EXISTS product_sizes_select ON public.product_sizes;
CREATE POLICY product_sizes_select ON public.product_sizes
  FOR SELECT TO authenticated
  USING (public.is_shipper());

DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products
  FOR SELECT TO authenticated
  USING (public.is_shipper());

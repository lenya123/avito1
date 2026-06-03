-- Этап 1.5 — возвращаем MODIFY-политику на product_sizes.
--
-- Миграция 20260414000004 заменила product_sizes_modify_owner на
-- product_sizes_modify_seller (через is_seller). stage1 каскадно дропнул
-- is_seller вместе с этой политикой. Теперь у product_sizes только SELECT
-- (восстановлен в 20260424000002). Owner через authenticated не может
-- ни INSERT, ни UPDATE, ни DELETE — только через service_role.
--
-- Восстанавливаем owner-only modify.

DROP POLICY IF EXISTS product_sizes_modify_owner ON public.product_sizes;

CREATE POLICY product_sizes_modify_owner ON public.product_sizes
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

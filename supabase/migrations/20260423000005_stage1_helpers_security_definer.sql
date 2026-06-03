-- Этап 1 пивота на B2B SaaS: возвращаем SECURITY DEFINER на RLS-хелперы.
--
-- В миграции stage1_drop_legacy_columns функции is_admin/is_owner/is_shipper
-- были объявлены как обычные SQL-функции без SECURITY DEFINER. Это приводит
-- к stack overflow: функция запрашивает users → срабатывает RLS-политика
-- users_select → политика вызывает is_owner() → is_owner() запрашивает users
-- → снова RLS-политика → бесконечная рекурсия.
--
-- SECURITY DEFINER выполняет функцию с правами владельца (postgres),
-- обходя RLS для внутреннего users-лукапа, что разрывает цикл.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shipper()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('shipper', 'owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_shipper() TO authenticated, service_role;

-- Заодно: is_premium_client — SQL-функция, должна была быть дропнута CASCADE
-- при удалении users.is_vibe_plus, но дроп мог остаться неполным в каталоге.
-- Явно удаляем (она больше не нужна: premium/VIP-клиенты — логика старой эпохи).
DROP FUNCTION IF EXISTS public.is_premium_client() CASCADE;

-- Polish (B6): атомарный инкремент users.session_epoch для logout
-- Используется в /api/auth/logout для инвалидации украденных/дублированных JWT

CREATE OR REPLACE FUNCTION public.increment_user_session_epoch(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users
     SET session_epoch = COALESCE(session_epoch, 0) + 1
   WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION public.increment_user_session_epoch(UUID) TO service_role;

COMMENT ON FUNCTION public.increment_user_session_epoch IS
  'Атомарный инкремент users.session_epoch. Инвалидирует все существующие JWT юзера при logout.';

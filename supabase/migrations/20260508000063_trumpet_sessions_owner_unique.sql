-- Owner-side trumpet: одна активная сессия на день на весь магазин.
CREATE UNIQUE INDEX IF NOT EXISTS trumpet_sessions_one_per_day_owner
  ON public.trumpet_sessions(trumpet_date)
  WHERE partner_id IS NULL AND cancelled_at IS NULL;

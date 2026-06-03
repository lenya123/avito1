-- Partner-side trumpet: одна активная сессия на день на каждого партнёра.
CREATE UNIQUE INDEX IF NOT EXISTS trumpet_sessions_one_per_day_partner
  ON public.trumpet_sessions(trumpet_date, partner_id)
  WHERE partner_id IS NOT NULL AND cancelled_at IS NULL;

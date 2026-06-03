-- Shipper-bot DM-алерты (фаза 1, шаг #6).
--
-- Идемпотентность для дневного дайджеста «в пуле X / у тебя Y сгорает».
-- Cron каждые 30 мин проверяет: прошёл ли сегодня send_by_today_cutoff
-- И не отправляли ли уже сегодня дайджест. Если оба условия true — шлём
-- всем shipper'ам и обновляем эту дату на сегодня (МСК).

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS last_shipper_pool_digest_date DATE;

COMMENT ON COLUMN public.business_settings.last_shipper_pool_digest_date IS
  'Shipper-bot: дата последней отправки дневного дайджеста (МСК). NULL = ещё не отправляли.';

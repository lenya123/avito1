-- Шаг между digest-уведомлениями (часов). Если step=3 и окно 10:00–22:00 МСК
-- → уведомления в 10/13/16/19/22. Если step=2 и то же окно → 10/12/14/16/18/20/22.
-- Range 1..12: 1 — каждый час в окне; 12 — раз в полсуток. Дефолт 3.
--
-- Используется в handler'ах director-receipts-digest / partner-receipts-digest:
-- они сами читают эти настройки каждый часовой тик и решают «должны ли мы
-- слать сейчас». Никаких ручных перепланирований при смене настроек.

ALTER TABLE public.business_settings
  ADD COLUMN director_digest_step_hours INTEGER NOT NULL DEFAULT 3
    CHECK (director_digest_step_hours BETWEEN 1 AND 12),
  ADD COLUMN partner_digest_step_hours INTEGER NOT NULL DEFAULT 3
    CHECK (partner_digest_step_hours BETWEEN 1 AND 12);

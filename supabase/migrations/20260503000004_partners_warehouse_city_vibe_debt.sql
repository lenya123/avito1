-- Расширение карточки партнёра: город склада + флаг «работает в долг».

ALTER TABLE public.partners
  ADD COLUMN warehouse_city    TEXT NULL,
  ADD COLUMN accepts_vibe_debt BOOLEAN NOT NULL DEFAULT TRUE;

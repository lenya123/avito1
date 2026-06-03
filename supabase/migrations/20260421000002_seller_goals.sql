-- Колонка users.goals jsonb — месячные цели продаж для seller-а.
-- Используется HeroCard на /seller/dashboard + редактируется в /seller/settings.
-- Формат: {"monthlyRevenueTarget": 500000, "monthlyOrdersTarget": 100} (оба необязательны).

alter table public.users
  add column if not exists goals jsonb not null default '{}'::jsonb;

comment on column public.users.goals is
  'Цели продаж для seller-а. Формат: {monthlyRevenueTarget?: number, monthlyOrdersTarget?: number}';

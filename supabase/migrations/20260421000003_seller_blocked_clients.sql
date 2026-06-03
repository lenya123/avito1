-- Таблица seller_blocked_clients: per-seller ban клиента (не глобальный).
-- Влияет на витрину магазина: заблокированный клиент не может покупать у этого seller.

create table if not exists public.seller_blocked_clients (
  seller_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null references public.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (seller_id, client_id)
);

create index if not exists seller_blocked_clients_client_idx
  on public.seller_blocked_clients (client_id);

comment on table public.seller_blocked_clients is
  'Per-seller ban: клиент заблокирован для витрины конкретного seller-а. Глобальный бан — users.is_blocked (owner-only).';

-- RLS: seller читает/пишет свои строки, owner читает все
alter table public.seller_blocked_clients enable row level security;

drop policy if exists seller_blocked_clients_seller_select on public.seller_blocked_clients;
create policy seller_blocked_clients_seller_select on public.seller_blocked_clients
  for select
  using (
    seller_id = (auth.jwt() ->> 'sub')::uuid
    or exists (
      select 1 from public.users u
      where u.id = (auth.jwt() ->> 'sub')::uuid and u.role = 'owner'
    )
  );

drop policy if exists seller_blocked_clients_seller_insert on public.seller_blocked_clients;
create policy seller_blocked_clients_seller_insert on public.seller_blocked_clients
  for insert
  with check (seller_id = (auth.jwt() ->> 'sub')::uuid);

drop policy if exists seller_blocked_clients_seller_delete on public.seller_blocked_clients;
create policy seller_blocked_clients_seller_delete on public.seller_blocked_clients
  for delete
  using (seller_id = (auth.jwt() ->> 'sub')::uuid);

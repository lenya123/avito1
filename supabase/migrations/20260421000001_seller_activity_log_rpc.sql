-- RPC: get_seller_activity_log
--
-- Возвращает записи activity_log относящиеся к seller-у: его собственная активность,
-- действия над его заказами и товарами. JOIN через SQL безопаснее OR-синтаксиса:
-- при большом каталоге OR-фильтр упирается в лимит URL-параметров Supabase.
create or replace function public.get_seller_activity_log(
  p_seller_id uuid,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz,
  user_id uuid
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, a.user_id
  from activity_log a
  where a.user_id = p_seller_id
     or (a.entity_type = 'order' and a.entity_id in (
        select o.id from orders o where o.seller_id = p_seller_id
     ))
     or (a.entity_type = 'product' and a.entity_id in (
        select p.id from products p where p.seller_id = p_seller_id
     ))
  order by a.created_at desc
  limit p_limit
  offset p_offset;
$$;

-- Счётчик за последние 24ч (для badge)
create or replace function public.get_seller_activity_recent_count(
  p_seller_id uuid
)
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from activity_log a
  where a.created_at >= now() - interval '24 hours'
    and (
      a.user_id = p_seller_id
      or (a.entity_type = 'order' and a.entity_id in (
         select o.id from orders o where o.seller_id = p_seller_id
      ))
      or (a.entity_type = 'product' and a.entity_id in (
         select p.id from products p where p.seller_id = p_seller_id
      ))
    );
$$;

grant execute on function public.get_seller_activity_log(uuid, int, int) to authenticated, service_role;
grant execute on function public.get_seller_activity_recent_count(uuid) to authenticated, service_role;

-- Индекс для быстрого поиска по entity_id (если ещё нет)
create index if not exists activity_log_entity_idx on activity_log (entity_type, entity_id, created_at desc);

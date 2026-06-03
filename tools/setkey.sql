update public.users
   set site_key = 'a8d3e2f1c5b497602d3e8f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8',
       updated_at = now()
 where id = '00000000-0000-4000-8000-000000000001';

select id, name, role, length(site_key) as klen, site_key
  from public.users
 where id = '00000000-0000-4000-8000-000000000001';

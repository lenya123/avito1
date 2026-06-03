select id, role, name, length(site_key) as klen, left(site_key, 16) as key_start, telegram_id from public.users where role = 'shipper' order by created_at desc limit 5;

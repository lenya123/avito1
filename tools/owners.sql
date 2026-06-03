select id, role, name, telegram_username, length(site_key) as key_len, left(site_key, 16) as key_start from public.users where role = 'owner';

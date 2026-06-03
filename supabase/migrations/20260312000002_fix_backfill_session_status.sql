-- Fix: backfilled API-only sessions should not have status='pending'
-- (pending means browser login in progress, but these sessions have no login/password)
UPDATE avito_browser_sessions
SET status = 'active'
WHERE avito_login IS NULL
  AND avito_client_id IS NOT NULL
  AND status = 'pending';

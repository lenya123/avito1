-- Backfill всех существующих запросов в порядке created_at — чтобы старые
-- получили меньшие номера, новые — большие.
UPDATE public.withdrawal_requests AS wr
   SET withdrawal_number = ord.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
      FROM public.withdrawal_requests
     WHERE withdrawal_number IS NULL
  ) AS ord
 WHERE wr.id = ord.id;

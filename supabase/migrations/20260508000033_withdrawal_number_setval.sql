-- Сдвигаем sequence на max(withdrawal_number) — чтобы новые INSERT'ы
-- продолжали с правильного номера.
SELECT setval(
  'public.withdrawal_number_seq',
  GREATEST(COALESCE((SELECT MAX(withdrawal_number) FROM public.withdrawal_requests), 0), 1),
  -- is_called=true когда max>0 (следующий nextval даёт max+1);
  -- is_called=false когда таблица пустая (следующий nextval даёт 1).
  (SELECT COUNT(*) > 0 FROM public.withdrawal_requests)
);

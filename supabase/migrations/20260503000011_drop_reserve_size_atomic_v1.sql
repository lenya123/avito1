-- Снос старой сигнатуры reserve_size_atomic перед расширением (новая принимает source).

DROP FUNCTION IF EXISTS public.reserve_size_atomic(UUID, TEXT, INTEGER);

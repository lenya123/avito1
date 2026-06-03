-- Атомарный захват слота дневного лимита AI-генераций (гонко-безопасно).
-- Возвращает true, если слот занят (used_count был < cap), иначе false.
CREATE OR REPLACE FUNCTION claim_ai_gen_slot(
  p_user_id uuid,
  p_product_id uuid,
  p_date date,
  p_category text,
  p_cap int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used int;
BEGIN
  INSERT INTO avito_ai_gen_counters (user_id, product_id, gen_date, category, used_count)
  VALUES (p_user_id, p_product_id, p_date, p_category, 1)
  ON CONFLICT (product_id, gen_date, category)
  DO UPDATE SET used_count = avito_ai_gen_counters.used_count + 1
  WHERE avito_ai_gen_counters.used_count < p_cap
  RETURNING used_count INTO v_used;

  RETURN v_used IS NOT NULL;
END;
$$;

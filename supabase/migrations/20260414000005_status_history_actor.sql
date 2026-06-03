-- ============================================================================
-- Multi-seller phase A.6: actor info в status_history
-- ============================================================================
-- status_history сейчас JSONB массив в orders. Добавляем actor_id/actor_role
-- как опциональные поля объектов истории через helper-функцию.
-- Миграция схемы не требуется (JSONB), но документируем ожидаемую структуру.
--
-- Формат элемента:
--   { status, timestamp, actor_id?: uuid, actor_role?: text, reason?: text }
--
-- Helper для записи истории из SQL/RPC (API код будет использовать
-- recordStatusHistory() в TypeScript).

CREATE OR REPLACE FUNCTION append_status_history(
  p_order_id UUID,
  p_status TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_actor_role TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry JSONB;
BEGIN
  v_entry := jsonb_build_object(
    'status', p_status,
    'timestamp', NOW()::TEXT
  );

  IF p_actor_id IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('actor_id', p_actor_id::TEXT);
  END IF;

  IF p_actor_role IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('actor_role', p_actor_role);
  END IF;

  IF p_reason IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('reason', p_reason);
  END IF;

  UPDATE orders
  SET status_history = COALESCE(status_history, '[]'::JSONB) || v_entry
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION append_status_history(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

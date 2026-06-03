-- Stage 2.6 — Безопасность клиентов: fraud_alerts → customer_id + risk view + детекторы.
--
-- 1) fraud_alerts.user_id → customer_id. Все старые записи, где user_id
--    не ссылается на действующего user-а, удаляются (в Stage 2.2 мы уже
--    занулили такие ссылки). Новые алерты создаются только для clients.
-- 2) Типы алертов переосмыслены под B2B (убраны self_referral/deposit_abuse).
-- 3) view customer_risk_profile — агрегат метрик на клиента.
-- 4) PL/pgSQL детекторы + обёртка run_fraud_detectors(). BullMQ-cron зовёт
--    её раз в сутки (добавим в scripts/worker.ts отдельным коммитом Stage 2.7).

-- ===== 1. Миграция user_id → customer_id =====

-- Очищаем осиротевшие записи (user_id IS NULL после Stage 2.2 и при прежних
-- ссылках на удалённых seller/client).
DELETE FROM public.fraud_alerts WHERE user_id IS NULL;

ALTER TABLE public.fraud_alerts
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

-- Бэкфилл невозможен: удалённые clients не сохранили tg_user_id → customers.
-- В тестовой среде fraud_alerts пустая. На проде оставшиеся записи мы удаляем
-- целиком — они ссылались на users, которых уже нет.
DELETE FROM public.fraud_alerts WHERE customer_id IS NULL;

ALTER TABLE public.fraud_alerts DROP COLUMN IF EXISTS user_id;

-- Сужаем тип алерта под B2B.
ALTER TABLE public.fraud_alerts DROP CONSTRAINT IF EXISTS fraud_alerts_alert_type_check;
ALTER TABLE public.fraud_alerts ADD CONSTRAINT fraud_alerts_alert_type_check CHECK (
  alert_type IN (
    'rapid_orders',            -- >=5 заказов за час
    'return_abuse',            -- return_rate > 50% при >=3 заказах
    'suspicious_cancellation', -- заказ отменён сразу после создания
    'frequent_cancellation',   -- cancel_rate > 70% при >=5 заказах
    'high_debt',               -- долг >= 90% лимита +ВАЙБ
    'suspicious_address'       -- один адрес у нескольких клиентов (задел)
  )
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_customer ON public.fraud_alerts(customer_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_open ON public.fraud_alerts(status)
  WHERE status = 'open';

-- ===== 2. View customer_risk_profile =====

CREATE OR REPLACE VIEW public.customer_risk_profile AS
SELECT
  c.id AS customer_id,
  c.name,
  c.telegram_username,
  c.is_frozen,
  c.is_blocked,
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status LIKE 'return_%') AS return_count,
  COUNT(o.id) FILTER (WHERE o.status = 'cancelled') AS cancel_count,
  COALESCE(
    ROUND(100.0 * COUNT(o.id) FILTER (WHERE o.status LIKE 'return_%')
      / NULLIF(COUNT(o.id), 0), 1), 0
  ) AS return_rate_pct,
  COALESCE(
    ROUND(100.0 * COUNT(o.id) FILTER (WHERE o.status = 'cancelled')
      / NULLIF(COUNT(o.id), 0), 1), 0
  ) AS cancel_rate_pct,
  COALESCE(vd.debt, 0) AS current_debt,
  COALESCE(
    c.vibe_credit_limit_override,
    (SELECT vibe_credit_default_limit FROM public.business_settings LIMIT 1)
  ) AS vibe_limit,
  MAX(o.created_at) AS last_order_at,
  (SELECT COUNT(*) FROM public.fraud_alerts f
     WHERE f.customer_id = c.id AND f.status = 'open') AS open_alerts_count
FROM public.customers c
LEFT JOIN public.orders o ON o.customer_id = c.id
LEFT JOIN public.customer_vibe_debt vd ON vd.customer_id = c.id
GROUP BY c.id, vd.debt;

GRANT SELECT ON public.customer_risk_profile TO authenticated;

COMMENT ON VIEW public.customer_risk_profile IS
  'Агрегированные метрики риска на клиента: проценты возвратов/отмен, долг, активные алерты.';

-- ===== 3. Детекторы =====
--
-- Все детекторы идемпотентны: не создают дубль, если уже есть открытый
-- алерт того же типа. SECURITY DEFINER — чтобы могли писать под any role.

CREATE OR REPLACE FUNCTION public.detect_high_return_rate()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  INSERT INTO public.fraud_alerts (alert_type, severity, customer_id, details, status)
  SELECT 'return_abuse', 'high', rp.customer_id,
    jsonb_build_object('return_rate_pct', rp.return_rate_pct,
                       'total_orders', rp.total_orders,
                       'threshold', 50),
    'open'
  FROM public.customer_risk_profile rp
  WHERE rp.return_rate_pct > 50 AND rp.total_orders >= 3
    AND NOT EXISTS (
      SELECT 1 FROM public.fraud_alerts f
      WHERE f.customer_id = rp.customer_id
        AND f.alert_type = 'return_abuse'
        AND f.status = 'open'
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_frequent_cancellation()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  INSERT INTO public.fraud_alerts (alert_type, severity, customer_id, details, status)
  SELECT 'frequent_cancellation', 'medium', rp.customer_id,
    jsonb_build_object('cancel_rate_pct', rp.cancel_rate_pct,
                       'total_orders', rp.total_orders,
                       'threshold', 70),
    'open'
  FROM public.customer_risk_profile rp
  WHERE rp.cancel_rate_pct > 70 AND rp.total_orders >= 5
    AND NOT EXISTS (
      SELECT 1 FROM public.fraud_alerts f
      WHERE f.customer_id = rp.customer_id
        AND f.alert_type = 'frequent_cancellation'
        AND f.status = 'open'
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_rapid_orders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  INSERT INTO public.fraud_alerts (alert_type, severity, customer_id, details, status)
  SELECT 'rapid_orders', 'high', o.customer_id,
    jsonb_build_object('orders_per_hour', COUNT(*),
                       'window_start', NOW() - INTERVAL '1 hour',
                       'threshold', 5),
    'open'
  FROM public.orders o
  WHERE o.customer_id IS NOT NULL
    AND o.created_at >= NOW() - INTERVAL '1 hour'
  GROUP BY o.customer_id
  HAVING COUNT(*) >= 5
  AND NOT EXISTS (
    SELECT 1 FROM public.fraud_alerts f
    WHERE f.customer_id = o.customer_id
      AND f.alert_type = 'rapid_orders'
      AND f.status = 'open'
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_high_debt()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  INSERT INTO public.fraud_alerts (alert_type, severity, customer_id, details, status)
  SELECT 'high_debt', 'medium', c.id,
    jsonb_build_object('current_debt', vd.debt,
                       'vibe_limit', COALESCE(c.vibe_credit_limit_override, bs.vibe_credit_default_limit),
                       'ratio_pct', ROUND(100.0 * vd.debt /
                         NULLIF(COALESCE(c.vibe_credit_limit_override, bs.vibe_credit_default_limit), 0), 1)),
    'open'
  FROM public.customers c
  JOIN public.customer_vibe_debt vd ON vd.customer_id = c.id
  CROSS JOIN LATERAL (SELECT vibe_credit_default_limit FROM public.business_settings LIMIT 1) bs
  WHERE c.vibe_enabled = TRUE
    AND vd.debt > 0
    AND COALESCE(c.vibe_credit_limit_override, bs.vibe_credit_default_limit) > 0
    AND vd.debt >= 0.9 * COALESCE(c.vibe_credit_limit_override, bs.vibe_credit_default_limit)
    AND NOT EXISTS (
      SELECT 1 FROM public.fraud_alerts f
      WHERE f.customer_id = c.id
        AND f.alert_type = 'high_debt'
        AND f.status = 'open'
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- Обёртка, зовущая все четыре детектора. Возвращает общее кол-во алертов.
CREATE OR REPLACE FUNCTION public.run_fraud_detectors()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
BEGIN
  v_total := v_total + public.detect_high_return_rate();
  v_total := v_total + public.detect_frequent_cancellation();
  v_total := v_total + public.detect_rapid_orders();
  v_total := v_total + public.detect_high_debt();
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.run_fraud_detectors IS
  'Прогон всех fraud-детекторов один проход. Вызывается суточным BullMQ cron или вручную из /owner/security.';

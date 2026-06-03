-- Recreate CHECK на fraud_alerts.alert_type — добавлен `vibe_replay`.
-- Anti-replay (канон §8.1): когда recognize-receipt детектирует повтор
-- operation_id, кроме Telegram-алёрта владельцу пишем запись в
-- fraud_alerts для постфактум-ревью на странице /owner/security.

ALTER TABLE public.fraud_alerts
  ADD CONSTRAINT fraud_alerts_alert_type_check CHECK (
    alert_type IN (
      'rapid_orders',
      'return_abuse',
      'suspicious_cancellation',
      'frequent_cancellation',
      'high_debt',
      'suspicious_address',
      'vibe_replay'
    )
  );

-- Drop CHECK на fraud_alerts.alert_type — будем добавлять vibe_replay
-- следующей миграцией (пулер не пускает DROP+ADD в одном файле).

ALTER TABLE public.fraud_alerts DROP CONSTRAINT IF EXISTS fraud_alerts_alert_type_check;

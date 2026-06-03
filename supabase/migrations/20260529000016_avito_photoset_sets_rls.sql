-- RLS: запись/чтение только через service_role (приложение). Anon/authenticated — нет доступа.
ALTER TABLE avito_photoset_sets ENABLE ROW LEVEL SECURITY;

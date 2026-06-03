// Sentry: клиентская инициализация. Отдаётся только если SENTRY_DSN задан.
// Для B2B SaaS-инсталляций каждая копия использует свой DSN (один DSN на проект-инсталляцию).
// Теги `client_name` / `tenant` навешиваются через NEXT_PUBLIC_TENANT_ID чтобы разделять сигналы
// клиентов в общем Sentry-org, когда наш supprt-аккаунт подключён к нескольким установкам.

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    initialScope: {
      tags: {
        tenant: process.env.NEXT_PUBLIC_TENANT_ID ?? "unknown",
      },
    },
  });
}

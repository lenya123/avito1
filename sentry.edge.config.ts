// Sentry: edge runtime (middleware, edge API routes).

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    initialScope: {
      tags: {
        tenant: process.env.NEXT_PUBLIC_TENANT_ID ?? "unknown",
      },
    },
  });
}

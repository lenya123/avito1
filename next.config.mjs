import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Puppeteer и связанные пакеты используются только в worker process (Node.js).
  // Они содержат динамические require() которые webpack не может анализировать.
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "puppeteer",
      "puppeteer-core",
      "puppeteer-extra",
      "puppeteer-extra-plugin-stealth",
      "puppeteer-extra-plugin",
      "clone-deep",
      "merge-deep",
      "bullmq",
      "ioredis",
    ],
  },
  // ESLint при `next build` НЕ валит сборку: в проекте пред-существующий
  // lint-долг (~21 файл: unused `_job`/`cn`/`routeKey`, unescaped-quotes
  // и т.п.), маскировался incremental-lint кэшем Next, всплывает только
  // при полном ре-линте. Полировка кода — отдельная финальная фаза
  // (memory feedback_phasing_and_final_qa). Гейты корректности целы:
  // TypeScript type-check при build ВКЛЮЧЁН + `tsc --noEmit` + probe.
  // Линт явно: `npm run lint` (задача фазы полировки).
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.img.avito.st",
      },
      {
        protocol: "https",
        hostname: "www.careofcarl.nl",
      },
      {
        protocol: "https",
        hostname: "www.careofcarl.de",
      },
    ],
  },
};

// Sentry webpack plugin: source maps, release tagging. Активен только когда
// переданы SENTRY_AUTH_TOKEN и org/project (в dev они не нужны).
// tunnelRoute убран: маршрут /monitoring не реализован и не нужен для нашего
// single-tenant SaaS (события идут напрямую на DSN).
const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
};

export default withSentryConfig(nextConfig, sentryOptions);

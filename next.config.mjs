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

export default nextConfig;

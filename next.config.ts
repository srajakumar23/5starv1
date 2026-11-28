import type { NextConfig } from "next";

// Trigger restart
const isProd = process.env.NODE_ENV === "production";

const allowedActionOrigins = [
  "www.5starambassador.com",
  "5starambassador.com",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
  process.env.VERCEL_URL || "5starambassador.com",
  ...(!isProd ? ["localhost:3000", "localhost:3001"] : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true, // Keep this if we ever do partial export, but fine for standalone too
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
      allowedOrigins: allowedActionOrigins,
    },
  },
  // @ts-ignore - allowedDevOrigins is a new feature in Next.js 14.2+
  allowedDevOrigins: [
    "127.0.0.1:3001",
    "localhost:3001",
    "capacitor://localhost",
    "http://localhost",
  ],
  env: {
    // Expose APP URL to client preference: process.env > calculated fallback
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://www.5starambassador.com"),
  },
  typescript: {
    // Type checking is now enforced — remove this comment if all types pass cleanly
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

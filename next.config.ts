import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.liteapi.travel" },
      { protocol: "https", hostname: "static.cupid.travel" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  /**
   * Security headers live here rather than in a platform config file, so they
   * apply identically on Vercel, on any other host, and in local development.
   * They were previously in netlify.toml, which meant they silently vanished the
   * moment the host changed.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()",
          },
          // Stripe's card form runs in an iframe it owns, so the page itself
          // never needs to be framed by anyone.
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

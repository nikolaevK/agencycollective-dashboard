/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.docuseal.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      // blob: — the Ad Creatives uploader reads a poster frame from the local video file.
      "media-src 'self' blob:",
      "font-src 'self' https://fonts.gstatic.com",
      "worker-src 'self' blob:",
      "connect-src 'self' data: https://graph.facebook.com https://fonts.googleapis.com https://fonts.gstatic.com https://docuseal.com https://*.docuseal.com",
      // blob: — the in-page "Exact PDF" invoice preview renders a client-generated PDF blob.
      "frame-src 'self' blob: https://docuseal.com https://*.docuseal.com https://www.figma.com https://embed.figma.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  // The four AI tools moved into one page with tabs (Creative Studio). HTTP
  // redirects (before middleware/rendering) keep old links + bookmarks working;
  // the request's query (e.g. the date range) is passed through.
  async redirects() {
    return [
      { source: "/dashboard/chat", destination: "/dashboard/creative?tab=analyst", permanent: false },
      { source: "/dashboard/generate", destination: "/dashboard/creative?tab=image", permanent: false },
      { source: "/dashboard/json-editor", destination: "/dashboard/creative?tab=json", permanent: false },
      { source: "/dashboard/ad-copy", destination: "/dashboard/creative?tab=ad-copy", permanent: false },
    ];
  },
};

module.exports = nextConfig;

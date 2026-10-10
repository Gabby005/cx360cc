/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" }, // the app can't be shown inside someone else's page
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  // Self-hosting (Docker) builds with BUILD_STANDALONE=1 to get a small, self-contained server. Netlify leaves it unset.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // Pages the user has just visited are reused for 30 seconds, so going back and forth between screens is instant
    // (the screen still refreshes itself in the background, and Overview/Inbox refresh on their own timers).
    staleTimes: { dynamic: 0, static: 180 },
    // Only ship the icons/charts/date helpers that are actually used.
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;

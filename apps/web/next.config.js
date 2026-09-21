/** @type {import('next').NextConfig} */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  // Expose API base to the web app so server components can fetch directly.
  env: { NEXT_PUBLIC_API_BASE: API_BASE },
  // In dev, proxy /api/* to the Express API on :4000 (client-side fetches).
  // Server-side fetches use an absolute URL via NEXT_PUBLIC_API_BASE.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_BASE}/api/:path*` }];
  },
};

module.exports = nextConfig;

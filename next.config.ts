import type { NextConfig } from "next";

/* Media in /public keeps its file name when it changes, so it can't be cached
   forever like Next's hashed bundles — a week, then served stale while it
   revalidates in the background. Repeat visits no longer re-check every clip,
   the arm model and Clawd's sprites before they can play. */
const MEDIA_CACHE = "public, max-age=604800, stale-while-revalidate=2592000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* next dev would otherwise write an AGENTS.md into the repo */
  agentRules: false,
  async headers() {
    return ["/projects/:path*", "/models/:path*", "/showcase/:path*", "/fonts/:path*"].map(
      (source) => ({ source, headers: [{ key: "Cache-Control", value: MEDIA_CACHE }] }),
    );
  },
};

export default nextConfig;

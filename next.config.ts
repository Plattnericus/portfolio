import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* next dev would otherwise write an AGENTS.md into the repo */
  agentRules: false,
};

export default nextConfig;

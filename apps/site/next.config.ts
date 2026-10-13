import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Stops `next dev` from writing AGENTS.md into apps/site. The generated text
  // breaks the punctuation check, and the repo CLAUDE.md covers agents.
  agentRules: false,
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile @nvoke/shared from source, so the site never needs a prior build
  // of the package (Vercel only builds apps/site).
  transpilePackages: ['@nvoke/shared'],
  turbopack: {
    resolveAlias: {
      '@nvoke/shared': '../../packages/shared/src/index.ts',
    },
  },
};

export default nextConfig;

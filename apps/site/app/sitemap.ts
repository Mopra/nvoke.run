import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

const ROUTES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/pricing', priority: 0.8 },
  { path: '/download', priority: 0.8 },
  { path: '/agents', priority: 0.7 },
  { path: '/docs', priority: 0.6 },
  { path: '/docs/api', priority: 0.6 },
  { path: '/docs/mcp', priority: 0.6 },
  { path: '/docs/agents', priority: 0.6 },
  { path: '/bot', priority: 0.5 },
  { path: '/opt-out', priority: 0.5 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: new URL(path, site.url).toString(),
    changeFrequency: 'monthly',
    priority,
  }));
}

import { z } from 'zod';
import { flag, optional } from './helpers.js';

/** Lead pipeline: the worker, map sources, launch feeds, webhooks, site shots. See .env.example. */
export const pipeline = {
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),
  /** Seed domains the worker crawls a day for the company index (leads/seed). 0 is off. */
  SEED_DAILY_DOMAINS: z.coerce.number().int().min(0).max(100_000).default(0),
  PRODUCT_HUNT_TOKEN: optional,
  NOMINATIM_URL: z.url().default('https://nominatim.openstreetmap.org'),
  // Comma separated; later entries are fallbacks when one is busy (429, 5xx).
  OVERPASS_URL: z
    .string()
    .default(
      [
        'https://overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
      ].join(','),
    )
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.url()).min(1)),
  // Local development only: webhooks may use http and private addresses.
  WEBHOOK_ALLOW_PRIVATE: flag('false'),
  // Homepage screenshots on site profiles, for sites without a share image.
  // Needs Chromium for playwright-core (deploy/deploy.sh installs it).
  SITE_SHOTS: flag('false'),
};

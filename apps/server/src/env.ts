import { z } from 'zod';

const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

/** Production site and the local `pnpm dev:site`. Used when CORS_ORIGINS is unset. */
export const DEFAULT_CORS_ORIGINS = ['https://nvoke.run', 'http://localhost:3001'];

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: optional,
  CLERK_SECRET_KEY: optional,
  CLERK_PUBLISHABLE_KEY: optional,
  CLERK_JWT_KEY: optional,
  CLERK_AUTHORIZED_PARTIES: list,
  // Signs Clerk's billing webhooks (POST /webhooks/clerk).
  CLERK_WEBHOOK_SIGNING_SECRET: optional,
  // Public URLs, for links we hand out: billing, claim emails, MCP metadata.
  SITE_URL: z.url().default('https://nvoke.run'),
  PUBLIC_API_URL: z.url().default('https://api.nvoke.run'),
  // POST /v1/agents/signup. Off answers 503 signup_unavailable.
  AGENT_SIGNUP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Sender of the claim email to the human behind an agent sign-up, through Day3.
  CLAIM_EMAIL_FROM: z.string().min(3).default('nvoke <hello@nvoke.run>'),
  // The site calls /v1/desktop/authorize from the browser, so its origins need CORS.
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CORS_ORIGINS)),

  // Lead pipeline. See .env.example for what each one does.
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),
  BRAVE_SEARCH_API_KEY: optional,
  BRAVE_REQUESTS_PER_SECOND: z.coerce.number().positive().max(1_000).default(1),
  BRAVE_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
  BRAVE_COST_PER_1000_USD: z.coerce.number().positive().default(5),
  /** The free web search (Mwmbl): `fallback` when Brave refuses us, `first` ahead of Brave, or `off`. */
  FREE_SEARCH: z.enum(['off', 'fallback', 'first']).default('fallback'),
  /** Milliseconds between two requests to the free web search. */
  FREE_SEARCH_INTERVAL_MS: z.coerce.number().int().min(1_000).default(3_000),
  /** Paid Brave requests one Describe your customer search may make (cache hits are free). */
  ICP_BRAVE_BUDGET: z.coerce.number().int().positive().default(120),
  /** Paid Brave requests an ongoing search's daily round may make. */
  ICP_DAILY_BRAVE_BUDGET: z.coerce.number().int().min(0).default(40),
  /** Paid Brave requests all ongoing searches' daily rounds together may make a day (UTC). */
  ONGOING_DAILY_BRAVE_BUDGET: z.coerce.number().int().min(0).default(250),
  // Operator alerts by email through Day3.
  DAY3_API_KEY: optional,
  ALERT_EMAIL_TO: list,
  ALERT_EMAIL_FROM: optional,
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
  SMTP_HELO_NAME: z.string().min(1).default('nvoke.run'),
  SMTP_PROBE_FROM: z.email().default('probe@nvoke.run'),
  // Local development only: webhooks may use http and private addresses.
  WEBHOOK_ALLOW_PRIVATE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_PROBE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // SMTP sessions per minute over IPv4, across the worker. Hostinger cuts
  // IPv4 port 25 off after bursts past about 5 a minute (IPv6 is not
  // throttled). 0 means no limit.
  SMTP_PROBES_PER_MINUTE: z.coerce.number().int().min(0).default(5),
  // SMTP sessions per minute in all (IPv4 and IPv6), and to any one mail
  // provider (Google, Microsoft 365, else the MX domain). 0 means no limit.
  SMTP_SESSIONS_PER_MINUTE: z.coerce.number().int().min(0).default(60),
  SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE: z.coerce.number().int().min(0).default(20),
  // Probe over IPv6 when the MX host has an AAAA record, IPv4 otherwise or on failure.
  SMTP_PREFER_IPV6: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // The free email verifier's share of those, probed from the API and taken
  // off the worker's budget. 0 keeps the free verifier on DNS only.
  TOOLS_SMTP_PROBES_PER_MINUTE: z.coerce.number().int().min(0).default(1),
  // Cloudflare Turnstile for the free tools. Unset means rate limits only.
  TURNSTILE_SECRET_KEY: optional,

  // Homepage screenshots on site profiles, for sites without a share image.
  // Needs Chromium for playwright-core (deploy/deploy.sh installs it).
  SITE_SHOTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Claude through OpenRouter (src/ai). Without the key, features that need it answer unavailable.
  OPENROUTER_API_KEY: optional,
  // Monthly Claude budget per account: this share of the plan's price, never below the floor.
  AI_MONTHLY_BUDGET_FLOOR_USD: z.coerce.number().min(0).default(1),
  AI_MONTHLY_BUDGET_PRICE_SHARE: z.coerce.number().min(0).max(1).default(0.25),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parses process.env once. Throws with every problem listed if it is invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`invalid environment:\n${z.prettifyError(result.error)}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}

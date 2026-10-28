import { describe, expect, it } from 'vitest';
import { DEFAULT_CORS_ORIGINS, EnvSchema, loadEnv } from './env.js';

describe('EnvSchema', () => {
  // Pins every variable. A key lost or shadowed when areas under env/ are
  // spread together fails here.
  it('keeps the exact set of environment keys', () => {
    expect(Object.keys(EnvSchema.shape).sort()).toEqual([
      'AGENT_SIGNUP_ENABLED',
      'AI_MONTHLY_BUDGET_FLOOR_USD',
      'AI_MONTHLY_BUDGET_PRICE_SHARE',
      'ALERT_EMAIL_FROM',
      'ALERT_EMAIL_TO',
      'BRAVE_COST_PER_1000_USD',
      'BRAVE_MONTHLY_BUDGET_USD',
      'BRAVE_REQUESTS_PER_SECOND',
      'BRAVE_SEARCH_API_KEY',
      'CLAIM_EMAIL_FROM',
      'CLERK_AUTHORIZED_PARTIES',
      'CLERK_JWT_KEY',
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'CLERK_WEBHOOK_SIGNING_SECRET',
      'CORS_ORIGINS',
      'DATABASE_URL',
      'DAY3_API_KEY',
      'FREE_SEARCH',
      'FREE_SEARCH_INTERVAL_MS',
      'HOST',
      'ICP_BRAVE_BUDGET',
      'ICP_DAILY_BRAVE_BUDGET',
      'LOG_LEVEL',
      'MICROSOFT_MAIL_CLIENT_ID',
      'MICROSOFT_MAIL_CLIENT_SECRET',
      'NODE_ENV',
      'NOMINATIM_URL',
      'ONGOING_DAILY_BRAVE_BUDGET',
      'OPENROUTER_API_KEY',
      'OVERPASS_URL',
      'PORT',
      'PRODUCT_HUNT_TOKEN',
      'PUBLIC_API_URL',
      'SECRETS_KEY',
      'SEED_DAILY_DOMAINS',
      'SENDING_ENABLED',
      'SENDING_USERS',
      'SERPER_API_KEY',
      'SERPER_COST_PER_1000_USD',
      'SERPER_MONTHLY_BUDGET_USD',
      'SITE_SHOTS',
      'SITE_URL',
      'SMTP_HELO_NAME',
      'SMTP_PREFER_IPV6',
      'SMTP_PROBES_PER_MINUTE',
      'SMTP_PROBE_ENABLED',
      'SMTP_PROBE_FROM',
      'SMTP_RELAYS',
      'SMTP_SESSIONS_PER_MINUTE',
      'SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE',
      'TOOLS_SMTP_PROBES_PER_MINUTE',
      'TURNSTILE_SECRET_KEY',
      'WEBHOOK_ALLOW_PRIVATE',
      'WEB_SEARCH_FALLBACK',
      'WEB_SEARCH_PROVIDER',
      'WORKER_CONCURRENCY',
    ]);
  });

  it('parses an empty environment to the defaults', () => {
    const env = loadEnv({});
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CLERK_AUTHORIZED_PARTIES: [],
      SITE_URL: 'https://nvoke.run',
      PUBLIC_API_URL: 'https://api.nvoke.run',
      AGENT_SIGNUP_ENABLED: true,
      CLAIM_EMAIL_FROM: 'nvoke <hello@nvoke.run>',
      CORS_ORIGINS: DEFAULT_CORS_ORIGINS,
      WORKER_CONCURRENCY: 16,
      BRAVE_REQUESTS_PER_SECOND: 1,
      BRAVE_COST_PER_1000_USD: 5,
      WEB_SEARCH_PROVIDER: 'brave',
      SERPER_COST_PER_1000_USD: 1,
      FREE_SEARCH: 'fallback',
      FREE_SEARCH_INTERVAL_MS: 3_000,
      ICP_BRAVE_BUDGET: 120,
      ICP_DAILY_BRAVE_BUDGET: 40,
      ONGOING_DAILY_BRAVE_BUDGET: 250,
      SEED_DAILY_DOMAINS: 0,
      ALERT_EMAIL_TO: [],
      NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
      SMTP_HELO_NAME: 'nvoke.run',
      SMTP_PROBE_FROM: 'probe@nvoke.run',
      WEBHOOK_ALLOW_PRIVATE: false,
      SMTP_PROBE_ENABLED: true,
      SMTP_PROBES_PER_MINUTE: 5,
      SMTP_SESSIONS_PER_MINUTE: 60,
      SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE: 20,
      SMTP_RELAYS: [],
      SMTP_PREFER_IPV6: true,
      TOOLS_SMTP_PROBES_PER_MINUTE: 1,
      SITE_SHOTS: false,
      AI_MONTHLY_BUDGET_FLOOR_USD: 1,
      AI_MONTHLY_BUDGET_PRICE_SHARE: 0.25,
      SENDING_ENABLED: true,
      SENDING_USERS: [],
    });
    expect(env.OVERPASS_URL).toHaveLength(6);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.WEB_SEARCH_FALLBACK).toBeUndefined();
    expect(env.BRAVE_MONTHLY_BUDGET_USD).toBeUndefined();
  });

  it('applies the list, optional and relay transforms', () => {
    const env = loadEnv({
      DATABASE_URL: '',
      CORS_ORIGINS: 'https://a.test, ,https://b.test',
      ALERT_EMAIL_TO: 'a@b.test, c@d.test',
      WEB_SEARCH_FALLBACK: '',
      SMTP_RELAYS: 'relay.test:1080=mx.relay.test',
      SITE_SHOTS: 'true',
      BRAVE_MONTHLY_BUDGET_USD: '10',
    });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
    expect(env.ALERT_EMAIL_TO).toEqual(['a@b.test', 'c@d.test']);
    expect(env.WEB_SEARCH_FALLBACK).toBeUndefined();
    expect(env.SMTP_RELAYS).toEqual([{ socks: { host: 'relay.test', port: 1080 }, heloName: 'mx.relay.test' }]);
    expect(env.SITE_SHOTS).toBe(true);
    expect(env.BRAVE_MONTHLY_BUDGET_USD).toBe(10);
  });

  it('rejects a malformed relay', () => {
    expect(() => loadEnv({ SMTP_RELAYS: 'nope' })).toThrow(/host:port=helo name/);
  });
});

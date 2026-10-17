import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import cors from '@fastify/cors';
import type { Sql } from 'postgres';
import type { Env } from '../env.js';
import { getSql as defaultGetSql } from '../db/client.js';
import { postgresStore, type DesktopAuthStore } from '../auth/store.js';
import { clerkUserDirectory, type UserDirectory } from '../auth/users.js';
import { clerkOAuthVerifier, clerkVerifier, registerAuth, type ClerkVerifier, type OAuthVerifier } from './auth.js';
import { clerkAgentDirectory, day3ClaimMailer } from '../agents/providers.js';
import type { AgentDirectory, ClaimMailer } from '../agents/signup.js';
import { agentRoutes } from './routes/agents.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { clerkIssuerFromPublishableKey, mcpRoutes } from './routes/mcp.js';
import { metaRoutes } from './routes/meta.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { desktopRoutes } from './routes/desktop.js';
import { leadsRoutes } from './routes/leads.js';
import { dropsRoutes } from './routes/drops.js';
import { createCollectors, sourceAvailability } from '../feed/collectors.js';
import { postgresAccounts, type Accounts } from '../leads/accounts.js';
import { clerkPlanSource } from '../billing/clerk.js';
import { webhookRoutes } from './routes/webhooks.js';
import { privacyRoutes } from './routes/privacy.js';
import { userWebhookRoutes } from './routes/user-webhooks.js';
import { toolsRoutes, type ToolsRoutesOptions } from './routes/tools.js';
import { createToolsDeps } from '../tools/deps.js';
import type { Resolve } from '../webhooks/address.js';
import { httpSender, type WebhookSender } from '../webhooks/send.js';
import { createAiFromEnv, type Ai } from '../ai/client.js';
import { siteProfileRoutes, type SiteProfileRoutesOptions } from './routes/site-profile.js';

/** Collaborators the routes need. Tests swap in fakes; production uses the defaults. */
export interface AppDeps {
  /** Lazily returns the pool, so the API boots without a database. */
  getSql: () => Sql;
  store: DesktopAuthStore;
  verifyClerk: ClerkVerifier | null;
  users: UserDirectory | null;
  accounts: Accounts;
  verifyOAuth: OAuthVerifier | null;
  /** Creates Clerk users for agent sign-up. Null switches sign-up off. */
  agentDirectory: AgentDirectory | null;
  claimMailer: ClaimMailer | null;
  /** True when the domain takes mail. Tests stub DNS out. */
  receivesMail?: (domain: string) => Promise<boolean>;
  /** Sends webhook test pings. Tests swap in a fake. */
  webhookSender?: WebhookSender;
  /** DNS for checking webhook URLs and the site profile's website. Tests stub it out. */
  webhookResolve?: Resolve;
  /** The free tools' verifier, crawler, DNS and Turnstile. Tests swap in fakes. */
  tools?: Partial<Omit<ToolsRoutesOptions, 'getSql'>>;
  /** Claude. Tests pass one built on a fake client. */
  ai?: Ai;
  /** Reads the user's website for the site profile. Tests swap in a fake. */
  readSite?: SiteProfileRoutesOptions['read'];
}

/** Builds the Fastify app without listening, so tests can use app.inject(). */
export async function buildApp(env: Env, overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const getSql = overrides.getSql ?? defaultGetSql;
  const deps: Omit<AppDeps, 'accounts' | 'claimMailer' | 'receivesMail' | 'webhookSender' | 'webhookResolve' | 'tools' | 'ai' | 'readSite'> = {
    getSql,
    store: overrides.store ?? postgresStore(getSql),
    verifyClerk: overrides.verifyClerk !== undefined ? overrides.verifyClerk : clerkVerifier(env),
    users:
      overrides.users !== undefined
        ? overrides.users
        : env.CLERK_SECRET_KEY
          ? clerkUserDirectory(env.CLERK_SECRET_KEY)
          : null,
    verifyOAuth: overrides.verifyOAuth !== undefined ? overrides.verifyOAuth : clerkOAuthVerifier(env),
    agentDirectory:
      overrides.agentDirectory !== undefined
        ? overrides.agentDirectory
        : env.CLERK_SECRET_KEY
          ? clerkAgentDirectory(env.CLERK_SECRET_KEY)
          : null,
  };

  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
    // Production sits behind Coolify's Traefik on the docker bridge
    // (deploy/README.md), so request.ip comes from X-Forwarded-For only when
    // the socket peer is a private or loopback address. A direct caller from
    // the internet cannot set its own IP with the header.
    trustProxy: ['loopback', 'uniquelocal'],
  });

  const accounts =
    overrides.accounts ??
    postgresAccounts(getSql, env.CLERK_SECRET_KEY ? clerkPlanSource(env.CLERK_SECRET_KEY) : null, app.log);

  // The web app on the site calls every /v1 route from the browser, deleting
  // searches and revoking keys included, so DELETE and PATCH must pass too.
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    credentials: false,
  });

  const claimMailer =
    overrides.claimMailer !== undefined
      ? overrides.claimMailer
      : env.DAY3_API_KEY
        ? day3ClaimMailer({ apiKey: env.DAY3_API_KEY, from: env.CLAIM_EMAIL_FROM, log: app.log })
        : null;

  registerAuth(app, { ...deps, accounts });

  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: '/v1', users: deps.users, accounts, siteUrl: env.SITE_URL });
  await app.register(metaRoutes, { prefix: '/v1', apiUrl: env.PUBLIC_API_URL });
  await app.register(apiKeyRoutes, { prefix: '/v1/api-keys', getSql });
  await app.register(agentRoutes, {
    prefix: '/v1/agents',
    getSql,
    directory: deps.agentDirectory,
    mailer: claimMailer,
    enabled: env.AGENT_SIGNUP_ENABLED,
    siteUrl: env.SITE_URL,
    apiUrl: env.PUBLIC_API_URL,
    receivesMail: overrides.receivesMail,
  });
  await app.register(mcpRoutes, {
    apiUrl: env.PUBLIC_API_URL,
    siteUrl: env.SITE_URL,
    clerkIssuer: clerkIssuerFromPublishableKey(env.CLERK_PUBLISHABLE_KEY),
  });
  await app.register(webhookRoutes, { prefix: '/webhooks', signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET ?? null, accounts });
  await app.register(desktopRoutes, { prefix: '/v1/desktop', store: deps.store });
  // requireAuth sets request.userId; the plugin's requireUser guard reads it.
  await app.register(leadsRoutes, {
    prefix: '/v1',
    getSql,
    authenticate: app.requireAuth,
    billingUrl: new URL('/desktop/billing', env.SITE_URL).toString(),
  });
  await app.register(dropsRoutes, {
    prefix: '/v1',
    getSql,
    authenticate: app.requireAuth,
    sourcesAvailable: sourceAvailability(createCollectors({ productHuntToken: env.PRODUCT_HUNT_TOKEN })),
  });
  const urlPolicy = { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE };
  await app.register(userWebhookRoutes, {
    prefix: '/v1',
    getSql,
    authenticate: app.requireAuth,
    urlPolicy,
    send: overrides.webhookSender ?? httpSender({ ...urlPolicy, resolve: overrides.webhookResolve }),
    resolve: overrides.webhookResolve,
  });
  let ai = overrides.ai;
  await app.register(siteProfileRoutes, {
    prefix: '/v1/site-profile',
    getSql,
    authenticate: app.requireAuth,
    getAi: () =>
      // Fastify's logger is pino underneath; its type only leaves out a few members.
      (ai ??= createAiFromEnv(getSql(), app.log as unknown as Logger)),
    urlPolicy,
    read: overrides.readSite,
    resolve: overrides.webhookResolve,
  });
  // Public, no auth: the site's opt-out page calls it from the browser.
  await app.register(privacyRoutes, { prefix: '/v1/privacy', getSql });
  // Public, no auth: the free tools on nvoke.run/tools.
  await app.register(toolsRoutes, { prefix: '/v1/tools', ...createToolsDeps(getSql, env), ...overrides.tools });

  return app;
}

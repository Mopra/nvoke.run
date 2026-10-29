// What every route registrar gets from buildApp. buildApp builds it once;
// each routes file turns it into its own plugin options, so adding a route
// group touches its own file and one line in routes/index.ts.

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import type { Env } from '../../env.js';
import type { Ai } from '../../ai/client.js';
import type { DesktopAuthStore } from '../../auth/store.js';
import type { UserDirectory } from '../../auth/users.js';
import type { Secrets } from '../../crypto/secrets.js';
import type { Accounts } from '../../leads/accounts.js';
import type { Resolve, UrlPolicy } from '../../webhooks/address.js';

export interface RouteContext<Overrides = object> {
  env: Env;
  /** Lazily returns the pool, so the API boots without a database. */
  getSql: () => Sql;
  /** Fastify's logger is pino underneath; its type only leaves out a few members. */
  log: Logger;
  store: DesktopAuthStore;
  users: UserDirectory | null;
  accounts: Accounts;
  /** Claude, built on first use. */
  getAi: () => Ai;
  urlPolicy: UrlPolicy;
  /** DNS for checking webhook URLs and the site profile's website. Undefined uses the real one. */
  resolve: Resolve | undefined;
  /** Seals mailbox passwords and signs unsubscribe links. Null switches sending off. */
  secrets: Secrets | null;
  /** The test overrides this route group reads. */
  overrides: Partial<Overrides>;
}

/** Registers one route group on the root app. */
export type RouteRegistrar<Overrides = object> = (app: FastifyInstance, ctx: RouteContext<Overrides>) => Promise<void>;

// Every route group, in registration order. A new group adds its registrar
// and override type in its own file, then one line to each list here.

import type { RouteRegistrar } from './context.js';
import { registerAgents, type AgentsOverrides } from './agents.js';
import { registerAiKey, type AiKeyOverrides } from './ai-key.js';
import { registerApiKeys } from './api-keys.js';
import { registerDesktop } from './desktop.js';
import { registerDrops } from './drops.js';
import { registerHealth } from './health.js';
import { registerLeads } from './leads.js';
import { registerMcp } from './mcp.js';
import { registerMe } from './me.js';
import { registerMeta } from './meta.js';
import { registerPrivacy } from './privacy.js';
import { registerSearchKey } from './search-key.js';
import { registerSending, type SendingOverrides } from './sending.js';
import { registerSiteProfile, registerSiteShot, type SiteProfileOverrides } from './site-profile.js';
import { registerTools, type ToolsOverrides } from './tools.js';
import { registerUnsubscribe } from './unsubscribe.js';
import { registerUserWebhooks, type UserWebhooksOverrides } from './user-webhooks.js';
import { registerWebhooks } from './webhooks.js';

/** The test overrides the route groups read, all in one. */
export type RouteOverrides = AgentsOverrides &
  UserWebhooksOverrides &
  SiteProfileOverrides &
  AiKeyOverrides &
  SendingOverrides &
  ToolsOverrides;

/** Order matters: Fastify registers in this order. The public routes come last. */
export const routes: RouteRegistrar<RouteOverrides>[] = [
  registerHealth,
  registerMe,
  registerMeta,
  registerApiKeys,
  registerAgents,
  registerMcp,
  registerWebhooks,
  registerDesktop,
  registerLeads,
  registerDrops,
  registerUserWebhooks,
  registerSiteProfile,
  registerAiKey,
  registerSearchKey,
  registerSending,
  // Public, no auth from here on.
  registerUnsubscribe,
  registerSiteShot,
  registerPrivacy,
  registerTools,
];

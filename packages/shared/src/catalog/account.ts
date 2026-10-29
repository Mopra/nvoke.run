// The Account group of the catalog: its endpoints, the MCP tools that call them and its error codes.

import { z } from 'zod';
import { AiKey, SaveAiKeyRequest } from '../ai-key.ts';
import { MeResponse } from '../api.ts';
import { PlansResponse } from '../plans.ts';
import { SaveSearchKeyRequest, SearchKey } from '../search-key.ts';
import { BuildSiteProfileRequest, SiteProfile, UpdateSiteProfileRequest } from '../site-profile.ts';
import type { Endpoint, McpTool } from './types.ts';

export const accountEndpoints: Endpoint[] = [
  {
    id: 'getMe',
    method: 'GET',
    path: '/v1/me',
    group: 'Account',
    summary: 'Who you are, your plan and this month’s usage',
    description:
      'Returns the account behind the token: profile, plan, verified emails used this month and the allowance. `?sync=1` re-reads the plan from billing first. `billingUrl` is where a human upgrades.',
    auth: 'key',
    status: 200,
    response: MeResponse,
    errors: [],
  },
  {
    id: 'listPlans',
    method: 'GET',
    path: '/v1/plans',
    group: 'Account',
    summary: 'The plan ladder',
    description: 'Every plan with its monthly allowance of verified emails and its price in USD. One product, every feature on every plan.',
    auth: 'public',
    status: 200,
    response: PlansResponse,
    errors: [],
  },
  {
    id: 'getSiteProfile',
    method: 'GET',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Your site profile and suggested searches',
    description:
      'What your own website says you sell, to whom, the proof it offers and the words it uses, with 3 to 6 searches that find your buyers. `not_found` until you build one with `POST /v1/site-profile`.',
    auth: 'key',
    status: 200,
    response: SiteProfile,
    errors: ['not_found'],
  },
  {
    id: 'buildSiteProfile',
    method: 'POST',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Read your website and plan searches',
    description:
      'Reads your homepage and its about, pricing and services pages (robots.txt honored), then Claude writes the profile and suggests 3 to 6 searches. Each suggestion holds a `search` body you can send to `POST /v1/searches` as is. Replaces the stored profile. Free, 10 a day per account. Takes about 20 seconds.',
    auth: 'key',
    body: BuildSiteProfileRequest,
    status: 200,
    response: SiteProfile,
    errors: ['invalid_request', 'site_unreadable', 'rate_limited', 'ai_unavailable'],
    example: { website: 'acme.dk' },
  },
  {
    id: 'updateSiteProfile',
    method: 'PATCH',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Edit your site profile',
    description: 'Changes the fields you send and keeps the rest. Suggestions stay as they were built.',
    auth: 'key',
    body: UpdateSiteProfileRequest,
    status: 200,
    response: SiteProfile,
    errors: ['invalid_request', 'not_found'],
    example: { audience: 'Dental clinics in Denmark with 3 to 20 chairs' },
  },
  {
    id: 'deleteSiteProfile',
    method: 'DELETE',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Delete your site profile',
    description: 'Deletes the profile, its suggested searches and its screenshot. Searches you started from it stay. Openers stop using it.',
    auth: 'key',
    status: 204,
    response: null,
    errors: ['not_found'],
  },
  {
    id: 'getAiKey',
    method: 'GET',
    path: '/v1/ai-key',
    group: 'Account',
    summary: 'Your own Claude key',
    description:
      'The Anthropic API key the account runs its Claude calls on, shown by its last 4 characters, and the model for each tier. `not_found` while the account runs on ours.',
    auth: 'key',
    status: 200,
    response: AiKey,
    errors: ['not_found'],
  },
  {
    id: 'saveAiKey',
    method: 'POST',
    path: '/v1/ai-key',
    group: 'Account',
    summary: 'Use your own Claude key',
    description:
      'Stores an Anthropic API key, sealed, and runs every Claude call of the account on it with the models you pick: `bulkModel` for the many small calls (fit, people, openers), `qualityModel` for the few that matter (search plans, site profile). The key and both models are checked with Anthropic before they are kept. Leave out `apiKey` to change only the models. Calls on your key are billed by Anthropic and do not count against our monthly Claude budget.',
    auth: 'key',
    body: SaveAiKeyRequest,
    status: 200,
    response: AiKey,
    errors: ['invalid_request', 'ai_key_rejected', 'ai_model_unknown', 'not_found', 'ai_unavailable'],
    example: { apiKey: 'sk-ant-...', bulkModel: 'claude-haiku-5-5', qualityModel: 'claude-sonnet-5-5' },
  },
  {
    id: 'deleteAiKey',
    method: 'DELETE',
    path: '/v1/ai-key',
    group: 'Account',
    summary: 'Stop using your own Claude key',
    description: 'Deletes the stored key. Claude calls run on ours again.',
    auth: 'key',
    status: 204,
    response: null,
    errors: ['not_found'],
  },
  {
    id: 'getSearchKey',
    method: 'GET',
    path: '/v1/search-key',
    group: 'Account',
    summary: 'Your own search key',
    description: 'The Serper or Brave key the account runs its paid web searches on, shown by its last 4 characters. `not_found` while the account runs on ours.',
    auth: 'key',
    status: 200,
    response: SearchKey,
    errors: ['not_found'],
  },
  {
    id: 'saveSearchKey',
    method: 'POST',
    path: '/v1/search-key',
    group: 'Account',
    summary: 'Use your own search key',
    description:
      'Stores a Serper or Brave Search API key, sealed, and runs every paid web search of the account on it. Replaces a stored key. The key is tried with one search before it is kept, billed to it. Results are cached and shared like ours. When the key is refused later, the search fails; it never falls back to our key.',
    auth: 'key',
    body: SaveSearchKeyRequest,
    status: 200,
    response: SearchKey,
    errors: ['invalid_request', 'search_key_rejected', 'source_unavailable', 'rate_limited'],
    example: { provider: 'serper', apiKey: 'your-serper-key' },
  },
  {
    id: 'deleteSearchKey',
    method: 'DELETE',
    path: '/v1/search-key',
    group: 'Account',
    summary: 'Stop using your own search key',
    description: 'Deletes the stored key. Web searches run on ours again.',
    auth: 'key',
    status: 204,
    response: null,
    errors: ['not_found'],
  },
];

export const accountTools: McpTool[] = [
  {
    name: 'get_account',
    title: 'Account, plan and usage',
    description:
      'Who you are signed in as, the plan, verified emails used this month and the allowance, and the billing link a human uses to upgrade. Call this first.',
    input: z.object({}),
    readOnly: true,
    destructive: false,
  },
];

export const accountErrors: Record<string, string> = {
  site_unreadable: 'We could not read the website: it is down, robots.txt keeps us out, it refuses our servers or it needs JavaScript. `detail` says which.',
  ai_unavailable: 'Claude could not answer right now, or the account spent its monthly Claude budget. Try again later.',
  ai_key_rejected: 'Anthropic refused the API key. Check it in the Claude Console.',
  ai_model_unknown: 'Anthropic does not offer that model to this key. `detail` names it.',
  search_key_rejected: 'Serper or Brave refused the key, or its plan has no credit left. `detail` says what it answered.',
};

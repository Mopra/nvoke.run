import { accountEndpoints, accountErrors, accountTools } from './catalog/account.ts';
import { agentClaimErrors, agentEndpoints, agentSignupErrors, agentSwitchErrors } from './catalog/agents.ts';
import { apiKeyEndpoints, apiKeyErrors } from './catalog/api-keys.ts';
import { authErrors, rateErrors, requestErrors, serverErrors } from './catalog/common.ts';
import { dropEndpoints, dropErrors, dropTools } from './catalog/drops.ts';
import { leadEndpoints, leadErrors, leadTools } from './catalog/leads.ts';
import { metaEndpoints } from './catalog/meta.ts';
import { privacyEndpoints } from './catalog/privacy.ts';
import { searchChangeTools, searchEndpoints, searchErrors, searchTools } from './catalog/searches.ts';
import { toolEndpoints, toolErrors } from './catalog/tools.ts';
import type { Endpoint, McpTool } from './catalog/types.ts';
import { webhookEndpoints, webhookErrors, webhookTools } from './catalog/webhooks.ts';

/**
 * Every public endpoint and MCP tool, described once. The server builds
 * `GET /v1/openapi.json` from the endpoints and registers the MCP tools from
 * the tools; the site renders both into /docs. Add a route here when you add
 * it to the server, or it is undocumented.
 *
 * Each group keeps its endpoints, MCP tools and error codes in
 * `catalog/<group>.ts`. A new group adds its file and one line to each list
 * below, so parallel work does not collide. The order of each list is the
 * order of the OpenAPI document, /docs and the MCP tool list.
 */

export type { Endpoint, EndpointAuth, McpTool } from './catalog/types.ts';
export { MCP_INSTRUCTIONS } from './catalog/mcp-instructions.ts';

export const ENDPOINTS: Endpoint[] = [
  ...accountEndpoints,
  ...searchEndpoints,
  ...leadEndpoints,
  ...dropEndpoints,
  ...webhookEndpoints,
  ...apiKeyEndpoints,
  ...agentEndpoints,
  ...privacyEndpoints,
  ...toolEndpoints,
  ...metaEndpoints,
];

/** What every error code means. Shown in the docs and the OpenAPI document. */
export const ERROR_CODES: Record<string, string> = {
  ...authErrors,
  ...agentClaimErrors,
  ...requestErrors,
  ...searchErrors,
  ...leadErrors,
  ...apiKeyErrors,
  ...agentSignupErrors,
  ...rateErrors,
  ...toolErrors,
  ...accountErrors,
  ...agentSwitchErrors,
  ...dropErrors,
  ...webhookErrors,
  ...serverErrors,
};

/** The tools of the MCP server at `/mcp`. Each one calls the REST endpoint named in its description. */
export const MCP_TOOLS: McpTool[] = [...accountTools, ...searchTools, ...leadTools, ...searchChangeTools, ...webhookTools, ...dropTools];

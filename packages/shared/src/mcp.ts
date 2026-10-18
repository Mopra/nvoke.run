/**
 * How an MCP tool from `MCP_TOOLS` runs: the REST route it stands for and the
 * polling `wait_for_search` does. Shared by the server's `POST /mcp` and the
 * desktop app's local MCP server, so both answer every tool the same way.
 */

export type McpToolArgs = Record<string, unknown>;
export interface McpToolCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
}

/** A REST answer as the tool runner needs it: status and raw body text. */
export interface McpRestResponse {
  status: number;
  body: string;
}

/** A type alias, not an interface, so it fits the SDK's indexed result type. */
export type McpToolResult = {
  content: { type: 'text'; text: string }[];
  isError: boolean;
};

const TERMINAL = new Set(['done', 'failed', 'canceled']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Query string from the defined values. */
function qs(values: McpToolArgs): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The search body of start_search and search_more from the flat tool arguments. */
function searchBody(a: McpToolArgs): unknown {
  const kind = a['kind'];
  const params =
    kind === 'local'
      ? { niche: a['niche'], location: a['location'] }
      : kind === 'web'
        ? { keyword: a['keyword'], country: a['country'] }
        : kind === 'domains'
          ? { items: a['items'], country: a['country'] }
          : kind === 'icp'
            ? { description: a['description'], product: a['product'], countries: a['countries'], locations: a['locations'] }
            : { keyword: a['keyword'], days: a['days'] };
  return { kind, params, limit: a['limit'], checkInboxes: a['checkInboxes'] };
}

/** Maps a tool call to the REST route it stands for. */
export function mcpToolRequest(name: string, a: McpToolArgs): McpToolCall {
  const id = encodeURIComponent(String(a['searchId'] ?? ''));
  switch (name) {
    case 'get_account':
      return { method: 'GET', url: '/v1/me' };
    case 'list_searches':
      return { method: 'GET', url: '/v1/searches' };
    case 'get_search':
    case 'wait_for_search':
      return { method: 'GET', url: `/v1/searches/${id}` };
    case 'set_search_ongoing':
      return { method: 'PATCH', url: `/v1/searches/${id}`, body: { ongoing: a['ongoing'] } };
    case 'set_check_inboxes':
      return { method: 'PATCH', url: `/v1/searches/${id}`, body: { checkInboxes: a['checkInboxes'] } };
    case 'cancel_search':
      return { method: 'POST', url: `/v1/searches/${id}/cancel` };
    case 'delete_search':
      return { method: 'DELETE', url: `/v1/searches/${id}` };
    case 'get_leads':
      return {
        method: 'GET',
        url: `/v1/searches/${id}/companies${qs({ verification: a['verification'], kind: a['kind'], q: a['q'], cursor: a['cursor'], limit: a['limit'] })}`,
      };
    case 'export_csv':
      return { method: 'GET', url: `/v1/searches/${id}/export.csv${qs({ verification: a['verification'], kind: a['kind'], q: a['q'] })}` };
    case 'draft_openers':
      return { method: 'POST', url: `/v1/searches/${id}/openers`, body: { companyIds: a['companyIds'], redo: a['redo'] } };
    case 'start_search':
      return { method: 'POST', url: '/v1/searches', body: searchBody(a) };
    case 'search_more':
      return { method: 'POST', url: `/v1/searches/${id}/more`, body: searchBody(a) };
    case 'list_webhooks':
      return { method: 'GET', url: '/v1/webhooks' };
    case 'create_webhook':
      return { method: 'POST', url: '/v1/webhooks', body: { url: a['url'], events: a['events'], scope: a['scope'], dropId: a['dropId'] } };
    case 'test_webhook':
      return { method: 'POST', url: `/v1/webhooks/${encodeURIComponent(String(a['webhookId'] ?? ''))}/test` };
    case 'delete_webhook':
      return { method: 'DELETE', url: `/v1/webhooks/${encodeURIComponent(String(a['webhookId'] ?? ''))}` };
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

/**
 * Runs one tool through `call`, which performs a REST request as the caller.
 * `wait_for_search` polls every 2 seconds until the search ends or its
 * timeout (at most 50 seconds) passes.
 */
export async function runMcpTool(
  name: string,
  args: McpToolArgs,
  call: (request: McpToolCall) => Promise<McpRestResponse>,
): Promise<McpToolResult> {
  const request = mcpToolRequest(name, args);
  let res = await call(request);
  if (name === 'wait_for_search' && res.status === 200) {
    const deadline = Date.now() + Math.min(Number(args['timeoutSeconds'] ?? 45), 50) * 1000;
    while (!TERMINAL.has((JSON.parse(res.body) as { status: string }).status) && Date.now() < deadline) {
      await sleep(2_000);
      res = await call(request);
      if (res.status !== 200) break;
    }
  }
  const text = res.status === 204 ? JSON.stringify({ ok: true }) : res.body;
  return { content: [{ type: 'text', text }], isError: res.status >= 400 };
}

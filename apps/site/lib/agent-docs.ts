// The plain text files agents read: /agents.md and /llms.txt. Built from the
// catalog in @nvoke/shared at request time, so they always match the API.

import { z } from 'zod';
import {
  ENDPOINTS,
  ERROR_CODES,
  MCP_INSTRUCTIONS,
  MCP_TOOLS,
  PLAN_ORDER,
  PLANS,
  UNCLAIMED_ACTIVE_DAYS,
  UNCLAIMED_DELETE_DAYS,
} from '@nvoke/shared';
import { site } from '@/lib/site';
import { urls } from '@/lib/docs';

function toolArgs(input: z.ZodObject): string {
  const js = z.toJSONSchema(input, { io: 'input' }) as { properties?: Record<string, unknown>; required?: string[] };
  const required = new Set(js.required ?? []);
  return Object.keys(js.properties ?? {})
    .map((k) => (required.has(k) ? k : `${k}?`))
    .join(', ');
}

export function agentsMarkdown(): string {
  const endpoints = ENDPOINTS.filter((e) => e.auth !== 'session')
    .map((e) => `- \`${e.method} ${e.path}\`${e.auth === 'public' ? ' (public)' : ''}: ${e.summary}.`)
    .join('\n');
  const tools = MCP_TOOLS.map((t) => `- \`${t.name}(${toolArgs(t.input)})\`: ${t.description}`).join('\n');
  const errors = Object.entries(ERROR_CODES)
    .map(([code, meaning]) => `- \`${code}\`: ${meaning}`)
    .join('\n');
  const plans = PLAN_ORDER.map((p) => `${PLANS[p].emailsPerMonth.toLocaleString('en-US')} for $${PLANS[p].priceUsd}`).join(', ');

  return `# nvoke for agents

nvoke finds companies, reads their own websites for published email addresses and checks every address with its mail server. You can do all of it through a REST API or an MCP server. This file tells you how.

- REST API base: ${urls.apiBase}
- MCP server: ${urls.mcp}
- OpenAPI 3.1: ${urls.openapi}
- Human docs: ${urls.docs}

## 1. Get a key

If your human already uses nvoke, ask them for an API key: ${site.url}/app/account, API keys (or Account in nvoke Desktop). Keys start with \`nvk_sk_\`.

If they have no account, create one yourself. No browser needed:

\`\`\`sh
curl -X POST "${urls.apiBase}/agents/signup" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"<the human’s real email>","agentName":"<your name>"}'
\`\`\`

The 201 response holds \`apiKey\`. Store it now; it is shown once. We email the human a link to claim the account. Unclaimed accounts are on the free plan, stop working after ${UNCLAIMED_ACTIVE_DAYS} days (403 \`claim_required\`) and are deleted after ${UNCLAIMED_DELETE_DAYS}. Tell your human to claim it. If they sign in another way first, your sign-up key is revoked.

Refusals: 409 \`account_exists\` (ask the human for a key), 422 \`email_not_accepted\`, 429 \`rate_limited\`.

## 2. Authenticate

Send \`Authorization: Bearer <apiKey>\` on every request.

## 3. The loop

1. \`POST /v1/searches\` with one of:
   - \`{"kind":"local","params":{"niche":"dentists","location":"Austin"},"limit":50}\` (a trade in a place, OpenStreetMap)
   - \`{"kind":"web","params":{"keyword":"design studio","country":"gb"}}\` (web search)
   - \`{"kind":"launches","params":{"keyword":"ai","days":7}}\` (Product Hunt and Show HN)
   - \`{"kind":"domains","params":{"items":["acme.com","Stripe"],"country":"us"}}\` (a list you already have: domains, URLs or company names, up to 1,000)
   It returns the search with \`status: "queued"\`.
2. \`GET /v1/searches/{id}\` every 5 seconds until \`status\` is \`done\`, \`failed\` or \`canceled\`. Searches take a few minutes. On \`failed\`, read \`error\`.
3. \`GET /v1/searches/{id}/companies?verification=valid\` for companies with addresses that accept mail. Follow \`nextCursor\` as \`cursor\`.
4. Or \`GET /v1/searches/{id}/export.csv?verification=valid\` for a CSV, one row per email.

## Webhooks instead of polling

\`POST /v1/webhooks\` with \`{"url":"https://...","events":["lead.ready"],"scope":"drops"}\` makes nvoke POST each company with a valid address to that URL once its checks are done (\`lead.ready\`), and each finished search (\`search.finished\`). Requests are signed the Standard Webhooks way; the 201 response holds the \`whsec_\` secret, once. Details: ${urls.docs}/webhooks

## Endpoints

${endpoints}

## MCP

URL: ${urls.mcp}. Streamable HTTP. Auth: the same bearer API key as a header, or OAuth through nvoke sign-in (clients that support MCP OAuth need only the URL).

Claude Code, one line:

\`\`\`sh
claude mcp add --transport http nvoke ${urls.mcp} --header "Authorization: Bearer <apiKey>"
\`\`\`

Tools:

${tools}

## Quota and money

Every feature is on every plan. Only addresses whose check comes back valid count. Plans a month: ${plans}. When the month is used up, searches fail with \`quota_exceeded\` and new ones answer 403. You cannot pay; give your human \`billingUrl\` from \`GET /v1/me\`.

## Errors

Every error is \`{"error":"<code>"}\` with a 4xx or 5xx status.

${errors}

Retry 5xx and \`database_unavailable\` with backoff. Do not retry 4xx unchanged.

## Rules

${MCP_INSTRUCTIONS.split('\n\n').at(-1)}

nvoke never sends email. Respect opt-outs: ${site.url}/opt-out.
`;
}

export function llmsText(): string {
  return `# nvoke

> nvoke finds companies, reads their websites for published email addresses and checks each address with its mail server. A web app for people at ${site.url}/app (nothing to install), nvoke Desktop for power users, and a REST API and MCP server for code and AI agents. Agents can sign up without a human.

Pay only for verified emails: 50 a month free, plans from $5. Searches run on nvoke's servers and take several minutes, since every address is checked with its mail server.

## Docs

- [Agent instructions](${site.url}/agents.md): everything an agent needs in one file, sign-up included
- [Quickstart](${site.url}/docs): get a key, start a search, take the valid leads
- [REST API](${site.url}/docs/api): every endpoint with fields and errors
- [MCP server](${site.url}/docs/mcp): connect Claude, Cursor or any MCP client
- [Agent sign-up](${site.url}/docs/agents): an agent creates the account, the human claims it
- [OpenAPI 3.1](${urls.openapi}): machine readable API description

## Product

- [Home](${site.url}/): what nvoke does
- [For agents](${site.url}/agents): the API, MCP and agent sign-up in one page
- [Pricing](${site.url}/pricing): the plan ladder

## Optional

- [nvokebot](${site.url}/bot): the crawler, and how sites block it
- [Privacy](${site.url}/privacy)
- [Terms](${site.url}/terms)
`;
}

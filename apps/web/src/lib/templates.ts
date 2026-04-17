export interface FunctionTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
  sampleInput: string;
}

const basic = `export default async function (input, ctx) {
  // \`input\` is the HTTP request: { method, path, query, headers, body }.
  // \`ctx.log(...)\` writes to this function's log stream.
  ctx.log("hello", input);
  return { echo: input };
}
`;

const webhook = `// Webhook handler: receives POSTs from external services.
// \`request.body\` is the parsed JSON payload.
// \`ctx.log(...)\` writes to this function's log stream.
export default async function (request, ctx) {
  const event = request.body ?? {};
  ctx.log("received webhook", event.type ?? "unknown");

  // TODO: handle the event here.

  return { ok: true };
}
`;

const transform = `// JSON transform: reshape an input payload.
// \`request.body\` is the parsed JSON; return any JSON-serializable value.
export default async function (request, ctx) {
  const items = Array.isArray(request.body?.items) ? request.body.items : [];
  ctx.log("transforming", items.length, "items");

  return {
    count: items.length,
    total: items.reduce((sum, i) => sum + (i.price ?? 0), 0),
    names: items.map((i) => i.name),
  };
}
`;

const fetchApi = `// Fetch-based API call: call an external service and return its result.
// Use \`ctx.log(...)\` to debug upstream responses.
export default async function (request, ctx) {
  const username = request.body?.username ?? "octocat";
  const res = await fetch(\`https://api.github.com/users/\${username}\`);
  ctx.log("github status", res.status);

  if (!res.ok) {
    return { status: res.status, body: { error: "upstream_failed" } };
  }

  const user = await res.json();
  return { name: user.name, followers: user.followers };
}
`;

const cron = `// Cron-style job: designed to be invoked on a schedule.
// Keep it idempotent — it may be retried or overlap.
// Scheduling isn't built in yet — invoke manually or from your own scheduler.
export default async function (request, ctx) {
  const now = new Date().toISOString();
  ctx.log("tick at", now);

  // TODO: do periodic work here (poll an API, refresh a cache, etc.).

  return { ran_at: now };
}
`;

export const FUNCTION_TEMPLATES: FunctionTemplate[] = [
  {
    id: "basic",
    name: "Basic",
    description: "Minimal echo function. Start here if you just want a blank slate.",
    code: basic,
    sampleInput: JSON.stringify({ name: "world" }, null, 2),
  },
  {
    id: "webhook",
    name: "Webhook handler",
    description: "Receive POSTs from Stripe, GitHub, Linear, and friends.",
    code: webhook,
    sampleInput: JSON.stringify(
      { type: "order.created", id: "ord_123", amount: 4200 },
      null,
      2,
    ),
  },
  {
    id: "transform",
    name: "JSON transform",
    description: "Reshape or aggregate a JSON payload.",
    code: transform,
    sampleInput: JSON.stringify(
      {
        items: [
          { name: "apple", price: 1 },
          { name: "pear", price: 2 },
          { name: "plum", price: 3 },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: "fetch",
    name: "Fetch API call",
    description: "Call an external HTTP API and return part of the response.",
    code: fetchApi,
    sampleInput: JSON.stringify({ username: "octocat" }, null, 2),
  },
  {
    id: "cron",
    name: "Cron-style job",
    description: "Idempotent periodic work. Invoke on a schedule.",
    code: cron,
    sampleInput: "{}",
  },
];

export const DEFAULT_TEMPLATE_ID = "basic";

export function getTemplate(id: string): FunctionTemplate {
  return (
    FUNCTION_TEMPLATES.find((t) => t.id === id) ?? FUNCTION_TEMPLATES[0]!
  );
}

import type { Metadata } from 'next';
import { z } from 'zod';
import { MCP_TOOLS } from '@nvoke/shared';
import { CodeBlock } from '@/components/docs/code-block';
import { DocsSection, DocsTitle, Inline, Prose } from '@/components/docs/prose';
import { urls } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'MCP server',
  description: 'Connect Claude, Cursor or any MCP client to nvoke with one URL. Tools to search, wait, read leads, export and set up webhooks.',
  alternates: { canonical: '/docs/mcp' },
};

const CLAUDE_CODE = `claude mcp add --transport http nvoke ${urls.mcp} --header "Authorization: Bearer nvk_sk_..."`;
const CLAUDE_CODE_OAUTH = `claude mcp add --transport http nvoke ${urls.mcp}`;

const CURSOR = JSON.stringify(
  {
    mcpServers: {
      nvoke: {
        url: urls.mcp,
        headers: { Authorization: 'Bearer nvk_sk_...' },
      },
    },
  },
  null,
  2,
);

/** Argument names of a tool, required ones first. */
function argsOf(input: z.ZodObject): string[] {
  const js = z.toJSONSchema(input, { io: 'input' }) as { properties?: Record<string, unknown>; required?: string[] };
  const required = new Set(js.required ?? []);
  return Object.keys(js.properties ?? {})
    .sort((a, b) => Number(required.has(b)) - Number(required.has(a)))
    .map((k) => (required.has(k) ? k : `${k}?`));
}

export default function McpDocs() {
  return (
    <>
      <DocsTitle
        title="MCP server"
        intro="Give your agent nvoke as tools. One URL, no install. It finds companies, waits for the checks and hands back the addresses that work."
      />

      <div className="glass flex flex-col gap-3 rounded-3xl p-6 text-sm">
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <span className="text-muted-foreground">URL</span>
          <code className="font-mono break-all">{urls.mcp}</code>
        </div>
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <span className="text-muted-foreground">Transport</span>
          <span>Streamable HTTP, stateless</span>
        </div>
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <span className="text-muted-foreground">Auth</span>
          <span>API key header, or OAuth through nvoke sign-in</span>
        </div>
      </div>

      <DocsSection id="auth" title="Two ways in">
        <Prose>
          <p>
            <strong>API key.</strong> Send <code>Authorization: Bearer nvk_sk_...</code> as a header. Get the key in the
            desktop app under Account, or let the agent <a href="/docs/agents">sign up on its own</a>.
          </p>
          <p>
            <strong>OAuth.</strong> Clients that speak MCP OAuth need only the URL. The first call answers 401 and points
            the client at nvoke’s sign-in. The browser opens, you sign in or sign up, approve, done. No key to paste.
          </p>
        </Prose>
      </DocsSection>

      <DocsSection id="claude-code" title="Claude Code">
        <Prose>
          <p>With a key. Keep it on one line: a line break in the middle drops the header on Windows.</p>
        </Prose>
        <CodeBlock label="shell" code={CLAUDE_CODE} />
        <Prose>
          <p>
            Or with OAuth. Then run <code>/mcp</code> in Claude Code and pick nvoke to sign in.
          </p>
        </Prose>
        <CodeBlock label="shell" code={CLAUDE_CODE_OAUTH} />
      </DocsSection>

      <DocsSection id="claude" title="Claude.ai and Claude Desktop">
        <Prose>
          <p>
            Settings, Connectors, Add custom connector. Paste the URL. Claude handles the sign-in.
          </p>
        </Prose>
        <CodeBlock label="url" code={urls.mcp} />
      </DocsSection>

      <DocsSection id="cursor" title="Cursor and others">
        <Prose>
          <p>
            In <code>~/.cursor/mcp.json</code>, or the same shape in any client that takes a URL and headers. Leave out{' '}
            <code>headers</code> to sign in with OAuth instead.
          </p>
        </Prose>
        <CodeBlock label="mcp.json" code={CURSOR} />
      </DocsSection>

      <DocsSection id="tools" title="Tools">
        <Prose>
          <p>
            Each tool runs the matching <a href="/docs/api">REST route</a> as you, so quotas, errors and shapes are the
            same. Errors come back as tool errors with the API’s <code>{'{ "error": "code" }'}</code> body.
          </p>
        </Prose>
        <div className="divide-y rounded-2xl border">
          {MCP_TOOLS.map((t) => (
            <div key={t.name} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm font-medium">{t.name}</code>
                {t.readOnly ? <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">read only</span> : null}
                {t.destructive ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">destructive</span>
                ) : null}
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                <Inline text={t.description} />
              </p>
              {argsOf(t.input).length > 0 ? (
                <p className="font-mono text-[12px] break-words text-muted-foreground">({argsOf(t.input).join(', ')})</p>
              ) : null}
            </div>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="loop" title="The loop">
        <Prose>
          <p>
            <code>get_account</code>, then <code>start_search</code>, then <code>wait_for_search</code> until the
            status is <code>done</code> (it waits up to 50 seconds per call), then <code>get_leads</code> with{' '}
            <code>verification: &quot;valid&quot;</code> or <code>export_csv</code>. The server sends the same
            instructions to the client when it connects.
          </p>
        </Prose>
      </DocsSection>
    </>
  );
}

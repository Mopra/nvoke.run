import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '@/components/docs/code-block';
import { DocsSection, DocsTitle, Prose } from '@/components/docs/prose';
import { urls } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'Docs',
  description: 'Use nvoke from code or from an AI agent: a REST API, an MCP server, and sign-up an agent can do on its own.',
  alternates: { canonical: '/docs' },
};

const SIGNUP = `curl -X POST "${urls.apiBase}/agents/signup" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@company.com","agentName":"Claude"}'`;

const START = `curl -X POST "${urls.apiBase}/searches" \\
  -H "Authorization: Bearer $NVOKE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"kind":"local","params":{"niche":"dentists","location":"Aarhus"},"limit":50}'`;

const POLL = `curl "${urls.apiBase}/searches/$SEARCH_ID" \\
  -H "Authorization: Bearer $NVOKE_API_KEY"`;

const LEADS = `curl "${urls.apiBase}/searches/$SEARCH_ID/companies?verification=valid" \\
  -H "Authorization: Bearer $NVOKE_API_KEY"`;

const CARDS = [
  { href: '/docs/api', title: 'REST API', body: 'Every endpoint, generated from the same schemas the server runs.' },
  { href: '/docs/mcp', title: 'MCP server', body: 'One URL. Claude, Cursor and friends get nine tools.' },
  { href: '/docs/agents', title: 'Agent sign-up', body: 'An agent makes the account itself. A human claims it later.' },
];

export default function DocsIndex() {
  return (
    <>
      <DocsTitle
        title="nvoke from code"
        intro="Everything the desktop app does, over HTTP. Start a search, wait a few minutes, take the addresses that check out. Your code or your agent drives it."
      />

      <div className="grid gap-3 pb-12 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="glass flex flex-col gap-2 rounded-3xl p-6 outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="font-medium tracking-[-0.01em]">{c.title}</span>
            <span className="text-sm text-pretty text-muted-foreground">{c.body}</span>
          </Link>
        ))}
      </div>

      <DocsSection id="key" title="1. Get a key">
        <Prose>
          <p>Two ways. Pick one.</p>
          <p>
            <strong>You have an account.</strong> Open the desktop app, go to Account, make an API key. It is shown once.
          </p>
          <p>
            <strong>You are an agent, or you have no account yet.</strong> Sign up with one call. You get a key back at
            once, and the human gets an email to claim the account. <Link href="/docs/agents">How agent sign-up works</Link>.
          </p>
        </Prose>
        <CodeBlock label="shell" code={SIGNUP} />
        <Prose>
          <p>
            Keys start with <code>nvk_sk_</code>. Send them as <code>Authorization: Bearer</code>. Keep them out of
            client code and out of git.
          </p>
        </Prose>
      </DocsSection>

      <DocsSection id="search" title="2. Start a search">
        <Prose>
          <p>
            Three kinds: <code>local</code> (a trade in a place), <code>web</code> (a keyword, optionally a country) and{' '}
            <code>launches</code> (fresh products on Product Hunt and Show HN). The search comes back at once with status{' '}
            <code>queued</code>.
          </p>
        </Prose>
        <CodeBlock label="shell" code={START} />
      </DocsSection>

      <DocsSection id="poll" title="3. Wait for it">
        <Prose>
          <p>
            Our servers find the companies, read their sites and check every address with its mail server. That takes a
            few minutes. Poll every few seconds until <code>status</code> is <code>done</code>, <code>failed</code> or{' '}
            <code>canceled</code>. The counters grow while it runs.
          </p>
        </Prose>
        <CodeBlock label="shell" code={POLL} />
      </DocsSection>

      <DocsSection id="leads" title="4. Take the leads">
        <Prose>
          <p>
            <code>verification=valid</code> keeps the addresses the mail server accepted. Pages hold 50 companies; pass{' '}
            <code>nextCursor</code> back as <code>cursor</code> for more. Want a file? Same filters on{' '}
            <code>export.csv</code>.
          </p>
        </Prose>
        <CodeBlock label="shell" code={LEADS} />
      </DocsSection>

      <DocsSection id="billing" title="What it costs">
        <Prose>
          <p>
            Same as the app. You pay for verified emails and nothing else: 50 a month free, then plans from $5. Invalid,
            risky, catch-all and unknown results are free. When the month runs out, searches fail with{' '}
            <code>quota_exceeded</code> and <code>GET /v1/me</code> gives a <code>billingUrl</code> where a human
            upgrades. <Link href="/pricing">Pricing</Link>.
          </p>
          <p>
            Machine readable: <a href={urls.openapi}>openapi.json</a>, <a href="/agents.md">agents.md</a> and{' '}
            <a href="/llms.txt">llms.txt</a>.
          </p>
        </Prose>
      </DocsSection>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '@/components/docs/code-block';
import { ChannelRows, DocsSection, DocsTitle, Prose } from '@/components/docs/prose';
import { urls } from '@/lib/docs';
import { formatPrice, pricing } from '@/lib/pricing';

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
  -d '{"kind":"local","params":{"niche":"dentists","location":"Austin"},"limit":50}'`;

const POLL = `curl "${urls.apiBase}/searches/$SEARCH_ID" \\
  -H "Authorization: Bearer $NVOKE_API_KEY"`;

const LEADS = `curl "${urls.apiBase}/searches/$SEARCH_ID/companies?verification=valid" \\
  -H "Authorization: Bearer $NVOKE_API_KEY"`;

const CARDS = [
  { href: '/docs/api', title: 'REST API', body: 'Every endpoint, generated from the same schemas the server runs.' },
  { href: '/docs/mcp', title: 'MCP server', body: 'One URL. Claude, Cursor and friends get every tool.' },
  { href: '/docs/webhooks', title: 'Webhooks', body: 'Leads pushed to your URL the moment they check out. Drops included.' },
  { href: '/docs/agents', title: 'Agent sign-up', body: 'An agent makes the account itself. A human claims it later.' },
];

export default function DocsIndex() {
  return (
    <>
      <DocsTitle
        title="nvoke from code"
        intro="Everything the app does, over HTTP. Start a search, wait a few minutes, take the addresses that check out. Your code or your agent drives it."
      />

      <ChannelRows className="border-b-0" items={CARDS.map((c) => ({ key: c.href, href: c.href, title: c.title, body: c.body }))} />

      <DocsSection id="key" channel="01" title="Get a key">
        <Prose>
          <p>Two ways. Pick one.</p>
          <p>
            <strong>You have an account.</strong> Open <a href="/app/account">Account in the web app</a> (or in nvoke Desktop) and make an API key. It is shown once.
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

      <DocsSection id="search" channel="02" title="Start a search">
        <Prose>
          <p>
            Four kinds: <code>local</code> (a trade in a place), <code>web</code> (a keyword, optionally a country),{' '}
            <code>launches</code> (fresh products on Product Hunt and Show HN) and <code>domains</code> (a list you already
            have: domains, URLs or company names in <code>params.items</code>, up to your plan's search limit). The search comes back at once
            with status <code>queued</code>.
          </p>
        </Prose>
        <CodeBlock label="shell" code={START} />
      </DocsSection>

      <DocsSection id="poll" channel="03" title="Wait for it">
        <Prose>
          <p>
            Our servers find the companies, read their sites and check every address with its mail server. That takes a
            few minutes. Poll every few seconds until <code>status</code> is <code>done</code>, <code>failed</code> or{' '}
            <code>canceled</code>. The counters grow while it runs.
          </p>
        </Prose>
        <CodeBlock label="shell" code={POLL} />
      </DocsSection>

      <DocsSection id="leads" channel="04" title="Take the leads">
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
            Same as the app. You pay for verified emails and nothing else: {pricing.free.emailsPerMonth} a month free, then plans from{' '}
            {formatPrice(pricing.cheapest.price)}. Invalid, risky, catch-all and unknown results are free. Emails from a {pricing.icpName} (<code>icp</code>) search count {pricing.icpTimes}. When the month runs out, searches fail with{' '}
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

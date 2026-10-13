import type { Metadata } from 'next';
import { UNCLAIMED_ACTIVE_DAYS, UNCLAIMED_DELETE_DAYS } from '@nvoke/shared';
import { CodeBlock } from '@/components/docs/code-block';
import { DocsSection, DocsTitle, Prose } from '@/components/docs/prose';
import { urls } from '@/lib/docs';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Agent sign-up',
  description: 'An AI agent can create an nvoke account and get an API key in one call. The human claims it from an email later.',
  alternates: { canonical: '/docs/agents' },
};

const REQUEST = `curl -X POST "${urls.apiBase}/agents/signup" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"ada@company.com","agentName":"Claude"}'`;

const RESPONSE = JSON.stringify(
  {
    apiKey: 'nvk_sk_...',
    account: {
      email: 'ada@company.com',
      status: 'unclaimed',
      claimEmailSent: true,
      activeUntil: '2026-10-20T09:00:00.000Z',
    },
    apiBase: urls.apiBase,
    mcpUrl: urls.mcp,
    docsUrl: urls.docs,
    nextSteps: ['Store the API key now. It is shown once...', '...'],
  },
  null,
  2,
);

const ERRORS: Array<[string, string, string]> = [
  ['409', 'account_exists', 'That email has an account. Ask the human for an API key instead.'],
  ['422', 'email_not_accepted', 'Disposable inbox, an address that opted out of nvoke, or a domain that takes no mail.'],
  ['429', 'rate_limited', 'Too many sign-ups from this IP, this email domain or overall. Try later.'],
  ['503', 'signup_unavailable', 'Agent sign-up is switched off right now.'],
];

export default function AgentDocs() {
  return (
    <>
      <DocsTitle
        title="Agent sign-up"
        intro="No browser, no human in the loop. An agent creates the account for the person it works for and gets a key in the same response."
      />

      <DocsSection id="signup" title="One call">
        <Prose>
          <p>
            Send the human’s email and, if you like, your name. Use their real address: it is the only way they can
            ever take the account over.
          </p>
        </Prose>
        <CodeBlock label="shell" code={REQUEST} />
        <Prose>
          <p>
            <strong>201</strong> with the key. Store it now, it is never shown again. Then use it on the{' '}
            <a href="/docs/api">REST API</a> or the <a href="/docs/mcp">MCP server</a>.
          </p>
        </Prose>
        <CodeBlock label="201 response" code={RESPONSE} />
      </DocsSection>

      <DocsSection id="claim" title="The human claims it">
        <Prose>
          <p>
            We send the address one email: who signed them up, and a link to claim the account. Claiming signs them in,
            accepts the terms and lets them keep or revoke your key. That is the only email the address gets from us.
          </p>
          <p>
            <strong>Until it is claimed</strong>, the account runs on the free plan: 50 verified emails a month. After{' '}
            {UNCLAIMED_ACTIVE_DAYS} days the key answers 403 <code>claim_required</code>. After {UNCLAIMED_DELETE_DAYS}{' '}
            days the account and everything in it is deleted.
          </p>
          <p>
            <strong>Tell your human.</strong> Something like: “I signed you up for nvoke to find leads. Check your inbox
            for an email from {site.name} and claim the account this week, or my key stops working.”
          </p>
          <p>
            If they sign in to nvoke any other way before claiming, the account is theirs and your sign-up key is
            revoked. That protects people whose address someone else typed in. Ask them for a new key.
          </p>
        </Prose>
      </DocsSection>

      <DocsSection id="human" title="What still needs a human">
        <Prose>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Claiming the account, within {UNCLAIMED_ACTIVE_DAYS} days.</li>
            <li>
              Paying. Checkout runs in a browser. When searches fail with <code>quota_exceeded</code>, hand them the{' '}
              <code>billingUrl</code> from <code>GET /v1/me</code>.
            </li>
            <li>Deciding what to do with the leads. In the EU, marketing email to these addresses usually needs prior consent. Do not bulk mail them on the human’s behalf.</li>
          </ul>
        </Prose>
      </DocsSection>

      <DocsSection id="errors" title="When it says no">
        <dl className="divide-y rounded-2xl border">
          {ERRORS.map(([status, code, meaning]) => (
            <div key={code} className="grid gap-1 px-4 py-3 sm:grid-cols-[3rem_11rem_1fr] sm:gap-4">
              <dt className="font-mono text-[13px] text-muted-foreground">{status}</dt>
              <dd className="font-mono text-[13px]">{code}</dd>
              <dd className="text-sm text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
        <Prose>
          <p>
            Limits: 3 sign-ups per IP an hour, a few per email domain a day, and a daily cap overall. Every attempt
            counts, the refused ones too.
          </p>
        </Prose>
      </DocsSection>

      <DocsSection id="oauth" title="Or let the client do it">
        <Prose>
          <p>
            MCP clients that speak OAuth need no sign-up call. Point them at <code>{urls.mcp}</code>, and the sign-in
            page they open lets a new user create an account on the spot. <a href="/docs/mcp">MCP setup</a>.
          </p>
        </Prose>
      </DocsSection>
    </>
  );
}

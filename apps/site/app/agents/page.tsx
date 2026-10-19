import type { Metadata } from 'next';
import Link from 'next/link';
import { MCP_TOOLS, UNCLAIMED_ACTIVE_DAYS } from '@nvoke/shared';
import { CodeBlock } from '@/components/docs/code-block';
import { AgentFace } from '@/components/site/agents/agent-face';
import { AgentSession } from '@/components/site/agents/agent-session';
import { Doors, type Door } from '@/components/site/agents/doors';
import { TypedCall } from '@/components/site/agents/typed-call';
import { RevealHeading } from '@/components/site/home/reveal';
import { Container, Eyebrow } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { urls } from '@/lib/docs';
import { formatCount, pricing } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'For agents',
  description:
    'nvoke for AI agents: a REST API, an MCP server, and sign-up an agent does on its own. Your agent finds companies and comes back with emails that work.',
  alternates: { canonical: '/agents' },
};

const freeEmails = formatCount(pricing.free.emailsPerMonth);

const PROMPT = `Find me leads with nvoke. Read ${urls.agentsMd} first and follow it.
If I have no nvoke account, sign me up with my email. Then find 50 dentists in Austin and give me the ones with a valid email as a CSV.`;

const SIGNUP = `curl -X POST ${urls.apiBase}/agents/signup -d '{"email":"you@company.com","agentName":"Claude"}'`;

const MCP_ADD = `claude mcp add --transport http nvoke ${urls.mcp}`;

const DOORS: Door[] = [
  {
    title: 'REST API',
    body: 'JSON over HTTPS, one bearer key. Every route the apps use.',
    href: '/docs/api',
    cta: 'API reference',
    signal: 'POST /v1/searches',
  },
  {
    title: 'MCP server',
    body: `One URL, ${MCP_TOOLS.length} tools. Claude, Cursor, anything that speaks MCP.`,
    href: '/docs/mcp',
    cta: 'Connect a client',
    signal: 'start_search',
  },
  {
    title: 'Agent sign-up',
    body: 'No account? One call makes one. You claim it from an email.',
    href: '/docs/agents',
    cta: 'How sign-up works',
    signal: '201 nvk_sk_',
  },
];

const HUMAN = [
  { title: 'Claim it', body: `One click from our email, within ${UNCLAIMED_ACTIVE_DAYS} days.` },
  { title: 'Pay for it', body: `${freeEmails} verified emails a month free. More is a checkout in your browser.` },
  { title: 'Hit send', body: 'nvoke never sends email. Your agent should not bulk mail either.' },
];

export default function AgentsPage() {
  return (
    <>
      {/* The hero: a giant dot matrix agent behind the line, then its session on the screen. */}
      <section className="relative overflow-hidden pt-20 pb-24 sm:pt-32 sm:pb-36">
        <AgentFace className="absolute top-0 left-1/2 w-[min(1400px,max(820px,120vw))] -translate-x-1/2 sm:-top-6" />
        <Container className="relative">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <Eyebrow className="text-primary">For agents &#183; REST &#183; MCP</Eyebrow>
            <RevealHeading as="h1" className="mt-6 text-display font-light" lines={['Let your agent', 'find the leads.']} />
            <p className="mt-6 max-w-lg text-lede text-pretty text-muted-foreground">
              It signs up, runs the search and comes back with addresses the mail server said yes to.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="xl" variant="dark">
                <Link href="/docs">Read the docs</Link>
              </Button>
              <Button asChild size="xl" variant="secondary">
                <a href="/agents.md">agents.md</a>
              </Button>
            </div>
          </div>
          <AgentSession className="mx-auto mt-20 max-w-5xl sm:mt-28" />
        </Container>
      </section>

      {/* The prompt to paste: the only text on the page worth copying. */}
      <section aria-labelledby="prompt-title" className="py-20 sm:py-28">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div className="flex flex-col items-start border-t pt-6">
            <Eyebrow>Start here</Eyebrow>
            <RevealHeading id="prompt-title" className="mt-8 text-headline font-light" lines={['Paste this.', 'That is the setup.']} />
            <p className="mt-5 max-w-sm text-[15px] text-pretty text-muted-foreground">
              Claude, ChatGPT, Cursor or any agent that makes HTTP calls.
            </p>
          </div>
          <CodeBlock label="prompt" code={PROMPT} className="self-end [&_pre]:whitespace-pre-wrap" />
        </Container>
      </section>

      <section aria-labelledby="doors-title" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="doors-title" className="max-w-2xl text-headline font-light" lines={['Three ways in.', 'One product.']} />
          <Doors doors={DOORS} />
        </Container>
      </section>

      {/* Sign-up and MCP: a line and a typed call each. */}
      <section aria-label="Sign-up and MCP" className="py-20 sm:py-28">
        <Container className="grid gap-16 sm:grid-cols-2 sm:gap-10">
          <div id="signup" className="flex min-w-0 flex-col items-start border-t pt-6">
            <Eyebrow>Sign-up</Eyebrow>
            <RevealHeading className="mt-8 text-title font-light" lines={['Signs itself up.']} />
            <p className="mt-3 max-w-sm text-[15px] text-pretty text-muted-foreground">
              No browser, no password. The key is in the response. The account is yours.
            </p>
            <TypedCall call={SIGNUP} reply='201  {"apiKey":"nvk_sk_...","claimEmailSent":true}' className="mt-10" />
          </div>
          <div id="mcp" className="flex min-w-0 flex-col items-start border-t pt-6">
            <Eyebrow>MCP</Eyebrow>
            <RevealHeading className="mt-8 text-title font-light" lines={['Or just the URL.']} />
            <p className="mt-3 max-w-sm text-[15px] text-pretty text-muted-foreground">
              Clients with OAuth open a browser. Sign in or sign up. Done.
            </p>
            <TypedCall call={MCP_ADD} reply={`Added nvoke  ${MCP_TOOLS.length} tools`} className="mt-10" />
          </div>
        </Container>
      </section>

      <section aria-labelledby="human-title" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="human-title" className="max-w-2xl text-headline font-light" lines={['Three things', 'stay yours.']} />
          <ol className="mt-12 grid gap-x-10 sm:mt-16 md:grid-cols-3">
            {HUMAN.map((h, i) => (
              <li key={h.title} className="flex flex-col gap-3 border-t py-6">
                <span className="cap text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-title font-light">{h.title}</h3>
                <p className="max-w-xs text-[15px] text-pretty text-muted-foreground">{h.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="cta-title" className="pt-20 pb-28 sm:pt-28 sm:pb-40">
        <Container className="flex flex-col items-center text-center">
          <RevealHeading id="cta-title" className="max-w-4xl text-display font-light" lines={['Hand it the URL.', 'Get the leads.']} />
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl" variant="dark">
              <Link href="/docs">Read the docs</Link>
            </Button>
            <Button asChild size="xl" variant="secondary">
              <Link href="/sign-up">Start free</Link>
            </Button>
          </div>
          <p className="cap mt-6 text-muted-foreground">{freeEmails} verified emails a month, free</p>
        </Container>
      </section>
    </>
  );
}

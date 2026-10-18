import type { Metadata } from 'next';
import Link from 'next/link';
import { MCP_TOOLS, UNCLAIMED_ACTIVE_DAYS } from '@nvoke/shared';
import { CodeBlock } from '@/components/docs/code-block';
import { ChannelSteps, SheetHead, SheetSection } from '@/components/docs/sheet';
import { Container } from '@/components/site/section';
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

const SIGNUP = `curl -X POST "${urls.apiBase}/agents/signup" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@company.com","agentName":"Claude"}'`;

const MCP_ADD = `claude mcp add --transport http nvoke ${urls.mcp}`;

const WAYS = [
  {
    title: 'REST API',
    body: 'JSON over HTTPS with a bearer key. Every route the apps use, documented from the same schemas the server runs.',
    href: '/docs/api',
    cta: 'API reference',
  },
  {
    title: 'MCP server',
    body: `One URL. ${MCP_TOOLS.length} tools: start a search, wait for it, read the leads, export a CSV. Claude, Cursor, anything that speaks MCP.`,
    href: '/docs/mcp',
    cta: 'Connect a client',
  },
  {
    title: 'Agent sign-up',
    body: 'No account yet? The agent makes one with a single call and gets a key back. You get an email to claim it.',
    href: '/docs/agents',
    cta: 'How sign-up works',
  },
];

const HUMAN = [
  {
    title: 'Claiming the account',
    body: `One click from the email we send. Within ${UNCLAIMED_ACTIVE_DAYS} days, or the agent’s key stops working.`,
  },
  {
    title: 'Paying',
    body: `${freeEmails} verified emails a month are free. More takes a checkout in your browser. Agents cannot buy plans.`,
  },
  {
    title: 'Hitting send',
    body: 'nvoke finds and checks addresses. It never sends email, and your agent should not bulk mail them either.',
  },
];

export default function AgentsPage() {
  return (
    <Container>
      <SheetHead
        eyebrow="For agents"
        title="Let your agent find the leads"
        intro="Tell it who you want. It signs up, runs the search on our servers and comes back with addresses the mail server said yes to."
      >
        <div className="mt-3 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/docs">Read the docs</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="/agents.md">agents.md</a>
          </Button>
        </div>
      </SheetHead>

      <div className="flex max-w-3xl flex-col gap-3 pb-16 sm:pb-24">
        <p className="cap text-muted-foreground">Paste this into your agent</p>
        <CodeBlock label="prompt" code={PROMPT} className="[&_pre]:whitespace-pre-wrap" />
        <p className="text-sm text-muted-foreground">Works with Claude, ChatGPT, Cursor or any agent that makes HTTP calls.</p>
      </div>

      <SheetSection
        id="ways"
        label="Interfaces"
        title="Three doors, one product"
        intro="Same searches, same checks, same price as the web app and nvoke Desktop."
      >
        <ol className="grid gap-x-8 md:grid-cols-3">
          {WAYS.map((w, i) => (
            <li key={w.title} className="flex flex-col gap-2 border-t py-5">
              <span className="cap text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="text-[21px] font-light tracking-[-0.02em]">{w.title}</h3>
              <p className="flex-1 text-[15px] text-pretty text-muted-foreground">{w.body}</p>
              <Link href={w.href} className="cap mt-2 text-foreground underline underline-offset-4 hover:decoration-2">
                {w.cta}
              </Link>
            </li>
          ))}
        </ol>
      </SheetSection>

      <SheetSection id="signup" label="Sign-up" title="Signs itself up">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col gap-4 text-[16px] text-pretty text-muted-foreground">
            <p className="text-foreground">No browser, no password, no human waiting on a form. One call, and the key is in the response.</p>
            <p>
              The account belongs to you, not the agent. We send you one email to claim it, keep the agent’s key or
              revoke it. Someone else typed your address? Sign in and their key dies.
            </p>
          </div>
          <CodeBlock label="shell" code={SIGNUP} />
        </div>
      </SheetSection>

      <SheetSection id="mcp" label="MCP" title="Or just give it the URL">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <p className="text-[16px] text-pretty text-muted-foreground">
            MCP clients that do OAuth need nothing else. A browser opens, you sign in or sign up, done.
          </p>
          <CodeBlock label="shell" code={MCP_ADD} />
        </div>
      </SheetSection>

      <SheetSection
        id="human"
        label="Human"
        title="What still needs you"
        intro="Agents do the legwork. Three things stay human, on purpose."
        className="pb-24 sm:pb-36"
      >
        <ChannelSteps steps={HUMAN} />
      </SheetSection>
    </Container>
  );
}

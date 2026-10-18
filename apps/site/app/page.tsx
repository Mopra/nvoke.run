import Link from 'next/link';
import { LiveSearch } from '@/components/mockups/live-search';
import { Faq, type FaqItem } from '@/components/site/faq';
import { Container, Eyebrow } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

const freeEmails = formatCount(pricing.free.emailsPerMonth);

/** How it works, as channels. Row 01 carries the three ways in, row 03 the five answers. */
const STEPS = [
  {
    cap: 'Find',
    title: 'Pick where to look',
    body: 'Three ways in. Same result: companies with a website.',
    list: [
      ['Local', 'A trade and a place, from OpenStreetMap'],
      ['Web', 'A keyword and a country, from Brave Search'],
      ['Launches', 'New products, from Product Hunt and Show HN'],
    ],
  },
  {
    cap: 'Crawl',
    title: 'Read their own website',
    body: 'Home, contact, about, team, imprint, privacy. Today, not from a list bought last year. Social networks, marketplaces and news sites are thrown out.',
  },
  {
    cap: 'Verify',
    title: 'Ask the mail server',
    body: 'nvoke asks if the mailbox exists and hangs up before a message would be sent. Answers are cached for 30 days.',
    list: [
      ['Valid', 'The mailbox exists. The only kind you pay for'],
      ['Catch-all', 'The domain takes mail for any address'],
      ['Risky', 'A temporary or unclear answer'],
      ['Invalid', 'Bad syntax, disposable, or rejected'],
      ['Unknown', 'The mailbox check could not run'],
    ],
  },
  {
    cap: 'Export',
    title: 'Send it with your own tool',
    body: 'CSV, API or MCP into your email tool or CRM. nvoke never sends. There is no send button.',
  },
] as const;

const LED: Record<string, string> = {
  Valid: 'bg-chart-1',
  'Catch-all': 'bg-chart-3',
  Risky: 'bg-chart-2',
  Invalid: 'bg-destructive',
  Unknown: '',
};

const DESKTOP = [
  ['Local render', 'Reads the sites that refuse servers or need JavaScript, from your computer'],
  ['Daily drops', 'Product Hunt, Show HN and Y Combinator every morning'],
  ['Quick search', 'A shortcut over any app. Grab names off the screen'],
  ['Local copy', 'Every result offline. Drag leads into Excel or your CRM'],
] as const;

const AGENTS = [
  ['REST API', 'Everything the app does'],
  ['MCP server', 'For Claude, Cursor and the rest'],
  ['Self signup', 'Your agent signs up alone, you claim it'],
] as const;

const FAQ: FaqItem[] = [
  {
    q: 'Where do the email addresses come from?',
    a: 'The company’s own website. nvoke reads a handful of pages per site, including addresses written as "name [at] domain [dot] com". No bought lists. No guessed addresses.',
  },
  {
    q: 'May I send marketing email to these addresses?',
    a: 'Check the rules in the recipient’s country first. Under the EU ePrivacy rules, many countries require prior consent for marketing email, including to businesses, info@ addresses and employees. nvoke is a research tool. It does not give you permission to email anyone. What you do with the results is on you.',
  },
  {
    q: 'What counts toward my monthly limit?',
    a: `Only addresses that verify as valid, each once per 12 months. Invalid, risky, catch-all and unknown are free. Free includes ${freeEmails} a month. Hit the limit and running searches stop. No overage. Upgrade, or wait for next month.`,
  },
  {
    q: 'Do I need to keep my computer on while a search runs?',
    a: 'No. Searches run on our servers. You need internet to start one and to see the results.',
  },
  {
    q: 'Do I have to install anything?',
    a: 'No. nvoke runs in your browser. nvoke Desktop is optional, for Windows, macOS and Linux, on the same account and plan. Its installers are not code signed yet, so Windows and macOS ask for one extra click the first time.',
  },
  {
    q: 'I run a website. How do I keep nvoke off it?',
    a: (
      <>
        Block <code className="font-mono text-sm text-foreground">nvokebot</code> in robots.txt, or opt out your domain
        or address on the{' '}
        <Link href="/opt-out" className="text-foreground underline underline-offset-4">
          opt-out page
        </Link>
        . It takes effect at once. The{' '}
        <Link href="/bot" className="text-foreground underline underline-offset-4">
          nvokebot page
        </Link>{' '}
        says exactly what the crawler does.
      </>
    ),
  },
];

const ch = (i: number) => String(i + 1).padStart(2, '0');

/** A list in mono capitals: a hairline row per item, the name and its note. */
function CapList({ items, leds }: { items: readonly (readonly [string, string])[]; leds?: Record<string, string> }) {
  return (
    <ul className="mt-5 border-b">
      {items.map(([name, note]) => (
        <li key={name} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-3 border-t py-2.5 sm:grid-cols-[9rem_1fr]">
          <span className="cap flex items-center gap-2 text-foreground">
            {leds ? <span className={cn('led', leds[name])} /> : <span className="text-primary">+</span>}
            {name}
          </span>
          <span className="cap text-muted-foreground normal-case tracking-[0.02em]">{note}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  return (
    <>
      {/* The hero: a plate with the line and the keys, and the screen running a search. */}
      <section className="pt-6 sm:pt-10">
        <Container>
          <div className="panel grid gap-10 p-5 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-12 lg:p-12">
            <div className="flex flex-col items-start gap-6">
              <Eyebrow className="text-primary">Find &#183; Crawl &#183; Verify</Eyebrow>
              <h1 className="text-[clamp(2.75rem,2rem+3vw,4rem)] leading-[1.02] font-light tracking-[-0.035em]">{site.tagline}</h1>
              <p className="max-w-xl text-lede text-pretty text-muted-foreground">
                Bought lists are stale the day you get them. nvoke reads each company’s own website today and asks the
                mail server if the address exists. You pay for the ones that do.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild size="xl" variant="dark">
                  <Link href="/sign-up">Start free</Link>
                </Button>
                <Button asChild size="xl" variant="secondary">
                  <Link href="/pricing">See pricing</Link>
                </Button>
              </div>
              <p className="cap text-muted-foreground">In the browser &#183; {freeEmails} verified emails a month free</p>
            </div>
            <LiveSearch />
          </div>
        </Container>
      </section>

      {/* How it works: four channels, the way the app lists things. */}
      <section id="how-it-works" aria-labelledby="how-title" className="py-16 sm:py-24">
        <Container>
          <div className="flex max-w-3xl flex-col gap-5">
            <Eyebrow>How it works</Eyebrow>
            <h2 id="how-title" className="text-headline font-light">
              nvoke finds and checks. Your tool sends.
            </h2>
          </div>
          <ol className="mt-12 border-b">
            {STEPS.map((step, i) => (
              <li
                key={step.cap}
                className="grid gap-x-6 gap-y-3 border-t py-8 sm:grid-cols-[3rem_8rem_1fr] lg:grid-cols-[3rem_8rem_1fr_1fr]"
              >
                <span className="cap text-muted-foreground tabular-nums">{ch(i)}</span>
                <span className="cap text-primary">{step.cap}</span>
                <div className="lg:col-span-1">
                  <h3 className="text-[22px] leading-tight font-light tracking-[-0.01em] sm:text-[26px]">{step.title}</h3>
                  <p className="mt-2 max-w-md text-[15px] text-pretty text-muted-foreground sm:text-base">{step.body}</p>
                </div>
                <div className="sm:col-start-3 lg:col-start-4">
                  {'list' in step ? (
                    <CapList items={step.list} leds={step.cap === 'Verify' ? LED : undefined} />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Pricing: the ladder printed in mono capitals. */}
      <section id="pricing" aria-labelledby="pricing-title" className="py-6 sm:py-8">
        <Container>
          <div className="panel grid gap-10 p-5 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:p-12">
            <div className="flex flex-col items-start gap-5">
              <Eyebrow>Pricing</Eyebrow>
              <h2 id="pricing-title" className="text-headline font-light">
                Pay for emails that work.
              </h2>
              <p className="max-w-md text-lede text-pretty text-muted-foreground">
                One plan, every feature. Only valid addresses count. The rest are free.
              </p>
              <Button asChild size="lg" variant="secondary" className="mt-2">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <div>
              <div className="grid grid-cols-[1fr_auto] gap-3 pb-3">
                <span className="cap text-muted-foreground">Verified a month</span>
                <span className="cap text-muted-foreground">Price</span>
              </div>
              <ul className="border-b">
                {pricing.tiers.map((t) => (
                  <li key={t.plan} className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-t py-2.5">
                    <span className="cap text-foreground tabular-nums">{formatCount(t.emailsPerMonth)}</span>
                    <span className={cn('cap tabular-nums', t.price === 0 ? 'text-primary' : 'text-foreground')}>
                      {t.price === 0 ? 'Free' : formatPrice(t.price)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="cap mt-3 text-muted-foreground normal-case tracking-[0.02em]">{pricing.vatNote}</p>
            </div>
          </div>
        </Container>
      </section>

      {/* The desktop app and the agents: two plates side by side. */}
      <section aria-label="nvoke Desktop and agents" className="py-6 sm:py-8">
        <Container className="grid gap-6 lg:grid-cols-2">
          <div id="desktop" className="panel flex flex-col items-start p-5 sm:p-10">
            <Eyebrow>nvoke Desktop</Eyebrow>
            <h2 className="mt-5 text-title font-light">The power tools.</h2>
            <p className="mt-3 max-w-md text-[15px] text-pretty text-muted-foreground sm:text-base">
              Everything in the browser, plus a native app for Windows, macOS and Linux. Same account, same plan.
            </p>
            <div className="w-full">
              <CapList items={DESKTOP} />
            </div>
            <Button asChild size="lg" variant="secondary" className="mt-8">
              <Link href="/download">Get nvoke Desktop</Link>
            </Button>
          </div>
          <div id="agents" className="panel flex flex-col items-start p-5 sm:p-10">
            <Eyebrow>Agents</Eyebrow>
            <h2 className="mt-5 text-title font-light">Or let your agent do it.</h2>
            <p className="mt-3 max-w-md text-[15px] text-pretty text-muted-foreground sm:text-base">
              Every search, export and check, over HTTP or MCP.
            </p>
            <div className="w-full">
              <CapList items={AGENTS} />
            </div>
            <div className="mt-8 flex flex-wrap gap-3 lg:mt-auto lg:pt-8">
              <Button asChild size="lg" variant="secondary">
                <Link href="/agents">nvoke for agents</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/docs">Docs</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div className="flex flex-col gap-5">
            <Eyebrow>Questions</Eyebrow>
            <h2 id="faq-title" className="text-headline font-light">
              Asked often.
            </h2>
          </div>
          <Faq items={FAQ} />
        </Container>
      </section>

      <section aria-labelledby="cta-title" className="pb-10">
        <Container>
          <div className="panel flex flex-col items-center gap-6 px-5 py-14 text-center sm:py-20">
            <Eyebrow>Start</Eyebrow>
            <h2 id="cta-title" className="max-w-3xl text-headline font-light">
              Your first search is one minute away.
            </h2>
            <p className="max-w-lg text-lede text-pretty text-muted-foreground">
              Sign up and search, right here in the browser. {freeEmails} verified emails a month are on the house.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button asChild size="xl" variant="dark">
                <Link href="/sign-up">Start free</Link>
              </Button>
              <Button asChild size="xl" variant="secondary">
                <Link href="/download">Get the desktop app</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

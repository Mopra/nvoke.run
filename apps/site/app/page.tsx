import Link from 'next/link';
import { ArrowRight, Download } from 'lucide-react';
import { VERIFICATION, VerificationBadge } from '@/components/mockups/primitives';
import {
  CommandWindowScene,
  ResultsWindowScene,
} from '@/components/mockups/scenes';
import { SEARCH_KINDS } from '@/components/mockups/screens';
import { Stage } from '@/components/mockups/stage';
import { VerificationTrace } from '@/components/mockups/verification-trace';
import type { Verification } from '@/components/mockups/data';
import { Faq, type FaqItem } from '@/components/site/faq';
import { Journey } from '@/components/site/journey';
import { LogoMark } from '@/components/site/logo';
import { PricingSlider } from '@/components/site/pricing-slider';
import { Container, Section } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';

const freeEmails = formatCount(pricing.free.emailsPerMonth);
const cheapest = `${formatPrice(pricing.cheapest.price)} a month for ${formatCount(pricing.cheapest.emailsPerMonth)}`;

const KINDS = [
  {
    title: 'Local businesses',
    body: 'A trade and a place. We pull them from OpenStreetMap and keep the ones with a website. Clinics, workshops, restaurants, shops.',
    source: 'Source: OpenStreetMap',
  },
  {
    title: 'Web search',
    body: 'A keyword, optionally a country. We keep company domains and throw out social networks, marketplaces, Wikipedia and news.',
    source: 'Source: Brave Search',
  },
  {
    title: 'New launches',
    body: 'Products shipped in the last days or weeks. Find the startups before everyone else does.',
    source: 'Sources: Product Hunt and Show HN',
  },
];

const DESKTOP_POINTS = [
  {
    title: 'Reads the sites servers can’t',
    body: 'Some sites refuse servers or need JavaScript. nvoke Desktop reads them from your own computer, when you allow it.',
  },
  {
    title: 'Fresh leads every morning',
    body: 'Daily drops watch Product Hunt, Show HN and Y Combinator for you, with a notification when new ones land.',
  },
  {
    title: 'Over any app',
    body: 'A shortcut opens search over whatever you are doing. Grab company names from the screen, or drop a CSV to enrich it.',
  },
  {
    title: 'Yours, offline too',
    body: 'A local copy of every result: instant to filter, there on a plane. Drag leads straight into Excel or your CRM.',
  },
];

const STATUSES: Verification[] = ['valid', 'catch_all', 'risky', 'invalid', 'unknown'];

const FAQ: FaqItem[] = [
  {
    q: 'Where do the email addresses come from?',
    a: 'The company’s own website. nvoke reads a handful of pages per site (home, contact, about, team, imprint, privacy), including addresses written as "name [at] domain [dot] com". No bought lists. No guessed addresses.',
  },
  {
    q: 'May I send marketing email to these addresses?',
    a: 'Check the rules in the recipient’s country first. Under the EU ePrivacy rules, many countries require prior consent for marketing email, including to businesses, info@ addresses and employees. nvoke is a research tool. It tells you who a company is and how they publish contact details. It does not give you permission to email anyone. What you do with the results is on you.',
  },
  {
    q: 'What counts toward my monthly limit?',
    a: `Only addresses that verify as valid, and each one counts once per 12 months. Invalid, risky, catch-all and unknown are free. The Free plan includes ${freeEmails} a month. Hit the limit and running searches stop. No overage charges. Upgrade, or wait for next month.`,
  },
  {
    q: 'Does nvoke send any email?',
    a: 'No. The check talks to the mail server and hangs up before a message would be sent. There is no send button.',
  },
  {
    q: 'Do I need to keep my computer on while a search runs?',
    a: 'No. Searches run on our servers. You need internet to start one and to see the results.',
  },
  {
    q: 'Do I have to install anything?',
    a: 'No. nvoke runs in your browser: sign up and search. nvoke Desktop is an optional app for Windows, macOS and Linux with extra power tools, on the same account and plan. Its installers are not code signed yet, so Windows and macOS ask for one extra click the first time. The download page shows where.',
  },
  {
    q: 'I run a website. How do I keep nvoke off it?',
    a: (
      <>
        Block <code className="font-mono text-sm text-foreground">nvokebot</code> in your robots.txt, or opt out your
        domain or address on the{' '}
        <Link href="/opt-out" className="text-foreground underline underline-offset-4">
          opt-out page
        </Link>
        . It takes effect immediately. The{' '}
        <Link href="/bot" className="text-foreground underline underline-offset-4">
          nvokebot page
        </Link>{' '}
        explains exactly what the crawler does.
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative -mt-20 overflow-hidden pt-44 sm:pt-56">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 h-[46rem] w-[78rem] max-w-[180vw] -translate-x-1/2 -translate-y-1/3"
        >
          <div className="aura absolute inset-0 rounded-full motion-safe:animate-breathe" />
        </div>
        <Container className="relative flex flex-col items-center text-center">
          <h1 className="max-w-5xl text-display font-semibold text-balance">{site.tagline}</h1>
          <p className="mt-8 max-w-2xl text-lede text-pretty text-muted-foreground">
            Bought lead lists are stale the day you get them. nvoke reads each company’s own website today and asks the
            mail server if the address exists. You pay for the ones that do.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="xl">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <Button asChild size="xl" variant="glass">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Runs in your browser, nothing to install. {freeEmails} verified emails a month, free.
          </p>
        </Container>
        <Container className="relative mt-16 pb-12 sm:mt-36 sm:pb-36">
          <Stage
            width={1200}
            height={760}
            motion="tilt"
            halo="strong"
            minScale={0.55}
            label="The nvoke app on Windows, showing a running search for bakeries in Lisbon with verified emails arriving."
          >
            <ResultsWindowScene />
          </Stage>
        </Container>
      </section>

      <Section
        id="how-it-works"
        className="overflow-x-clip"
        title="How it works"
        intro="nvoke finds the companies and checks the emails. Your email tool sends. Then you put it on a schedule."
      >
        <Journey />
      </Section>

      <Section
        id="searches"
        title="Three ways to find companies"
        intro="Three starting points. Same result: companies with checked emails."
      >
        <div className="grid gap-16 md:grid-cols-3 md:gap-14">
            {KINDS.map((k, i) => {
              const Icon = SEARCH_KINDS[i]?.icon;
              return (
                <article key={k.title} className="flex flex-col gap-4">
                  {Icon ? <Icon className="size-7 text-muted-foreground/70" strokeWidth={1.25} /> : null}
                  <h3 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em]">{k.title}</h3>
                  <p className="text-pretty text-muted-foreground">{k.body}</p>
                  <p className="mt-auto text-sm text-muted-foreground/80">{k.source}</p>
                </article>
              );
            })}
        </div>
      </Section>

      <section id="desktop" aria-labelledby="desktop-title" className="overflow-hidden py-20 sm:py-36">
        <Container>
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
            <h2 id="desktop-title" className="text-headline font-semibold text-balance">
              nvoke Desktop. The power tools.
            </h2>
            <p className="max-w-2xl text-lede text-pretty text-muted-foreground">
              Everything in the browser, plus a native app for Windows, macOS and Linux. Same account, same plan, same
              searches. No browser extension reading what you browse.
            </p>
            <Button asChild size="lg" variant="glass" className="mt-2">
              <Link href="/download">
                <Download />
                Get nvoke Desktop
              </Link>
            </Button>
          </div>
        </Container>
        <Container className="mt-12 sm:mt-28">
          <Stage
            width={1200}
            height={680}
            minScale={0.55}
            label="The nvoke app on macOS: the list of searches, with the command bar open to jump to Dentists in Austin."
          >
            <CommandWindowScene />
          </Stage>
        </Container>
        <Container>
          <dl className="mt-20 grid gap-x-12 gap-y-12 sm:mt-32 sm:grid-cols-2 lg:grid-cols-4">
            {DESKTOP_POINTS.map((p) => (
              <div key={p.title} className="flex flex-col gap-2.5">
                <dt className="font-display text-lg font-semibold tracking-[-0.015em]">{p.title}</dt>
                <dd className="text-pretty text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section id="verification" aria-labelledby="verification-title" className="overflow-x-clip py-20 sm:py-36">
        <Container className="grid items-start gap-16 lg:grid-cols-[1fr_1.05fr] lg:gap-24">
          <div className="flex flex-col gap-6">
            <h2 id="verification-title" className="text-headline font-semibold text-balance">
              Every address, checked with the mail server
            </h2>
            <p className="text-lede text-pretty text-muted-foreground">
              Published is not the same as working. nvoke asks the mail server if the mailbox exists. Nothing gets
              sent.
            </p>
            <dl className="mt-6 flex flex-col">
              {STATUSES.map((s) => (
                <div key={s} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-4 py-4">
                  <dt>
                    <VerificationBadge value={s} className="h-6 px-2.5 text-xs" />
                  </dt>
                  <dd className="text-pretty text-muted-foreground">{VERIFICATION[s].meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">
              Results are cached for 30 days. No hammering the same server twice.
            </p>
          </div>
          <div className="reveal relative lg:sticky lg:top-28">
            <div aria-hidden="true" className="aura absolute -inset-[12%] rounded-full opacity-80" />
            <VerificationTrace className="relative" />
          </div>
        </Container>
      </section>

      <section id="agents" aria-labelledby="agents-title" className="py-20 sm:py-36">
        <Container>
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
            <h2 id="agents-title" className="text-headline font-semibold text-balance">
              Or let your agent do it
            </h2>
            <p className="max-w-2xl text-lede text-pretty text-muted-foreground">
              A REST API and an MCP server with everything the app does. Your agent can even sign you up on its own.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="glass">
                <Link href="/agents">nvoke for agents</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/docs">Docs</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Section
        id="pricing"
        title="Pay for emails that work"
        intro={`One plan. Every feature. You pay for verified emails and nothing else: ${freeEmails} free a month, then from ${cheapest}.`}
      >
        <PricingSlider />
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {pricing.vatNote}{' '}
          <Link href="/pricing" className="text-foreground underline underline-offset-4">
            How pricing works
          </Link>
        </p>
      </Section>

      <Section id="faq" title="Questions">
        <div className="mx-auto max-w-3xl">
          <Faq items={FAQ} />
        </div>
      </Section>

      <section className="relative overflow-hidden py-32 sm:py-52">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 h-[40rem] w-[66rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2"
        >
          <div className="aura absolute inset-0 rounded-full motion-safe:animate-breathe" />
        </div>
        <Container className="relative flex flex-col items-center text-center">
          <LogoMark className="size-16 sm:size-20" />
          <h2 className="mt-12 max-w-4xl text-headline font-semibold text-balance">
            Your first search is one minute away.
          </h2>
          <p className="mt-5 max-w-xl text-lede text-pretty text-muted-foreground">
            Sign up. Search. Right here in your browser. {freeEmails} verified emails a month are on the house.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <Button asChild size="xl" variant="glass">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
          <Link
            href="/download"
            className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Prefer a native app? Get nvoke Desktop
            <ArrowRight className="size-3.5" />
          </Link>
        </Container>
      </section>
    </>
  );
}

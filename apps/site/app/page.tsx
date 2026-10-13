import type { ReactNode } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { DENTISTS } from '@/components/mockups/data';
import { MockButton, MockFit, VERIFICATION, VerificationBadge } from '@/components/mockups/primitives';
import {
  CompanyRow,
  MacCommandWindow,
  NewSearchForm,
  SEARCH_KINDS,
  SearchRow,
  WindowsResultsWindow,
} from '@/components/mockups/screens';
import { Stage } from '@/components/mockups/stage';
import { VerificationTrace } from '@/components/mockups/verification-trace';
import type { Verification } from '@/components/mockups/data';
import { Faq, type FaqItem } from '@/components/site/faq';
import { LogoMark } from '@/components/site/logo';
import { PricingSlider } from '@/components/site/pricing-slider';
import { Container, Section } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';

const freeEmails = formatCount(pricing.free.emailsPerMonth);
const cheapest = `${formatPrice(pricing.cheapest.price)} a month for ${formatCount(pricing.cheapest.emailsPerMonth)}`;

const STEPS = [
  {
    title: 'Describe the companies you are looking for',
    body: 'Pick a search kind and fill in two fields, for example "dentists" and "Copenhagen". Choose how many companies to look at.',
  },
  {
    title: 'nvoke reads their websites',
    body: 'Our servers find the companies, open up to eight pages on each site (home, contact, about, team, imprint) and collect the email addresses published there.',
  },
  {
    title: 'Keep the addresses that work',
    body: 'Every address is checked with its mail server. Filter to the valid ones, copy them, or save a CSV for your CRM.',
  },
];

const KINDS = [
  {
    title: 'Local businesses',
    body: 'A trade and a place. nvoke looks them up on OpenStreetMap and keeps the businesses that list a website. Good for clinics, workshops, restaurants and shops in one city or region.',
    source: 'Source: OpenStreetMap',
  },
  {
    title: 'Web search',
    body: 'A keyword and an optional country. nvoke runs a web search, keeps the company domains and drops social networks, marketplaces, Wikipedia and news sites.',
    source: 'Source: Brave Search',
  },
  {
    title: 'New launches',
    body: 'Products launched in the last days or weeks, with an optional keyword. Useful when you work with startups and want to find them early.',
    source: 'Sources: Product Hunt and Show HN',
  },
];

const DESKTOP_POINTS = [
  {
    title: 'Its own window',
    body: 'nvoke sits in your taskbar or Dock like any other program. It does not get lost between thirty browser tabs.',
  },
  {
    title: 'Keeps working when you close it',
    body: 'Searches run on our servers. Quit the app, open it tomorrow, and the finished results are there.',
  },
  {
    title: 'Nothing in your browser',
    body: 'No extension that can read the pages you visit. nvoke only knows about the searches you start in it.',
  },
  {
    title: 'Files where you want them',
    body: 'Export opens the normal save dialog of your system, so the CSV lands in the folder you pick.',
  },
];

const STATUSES: Verification[] = ['valid', 'catch_all', 'risky', 'invalid', 'unknown'];

const FAQ: FaqItem[] = [
  {
    q: 'Where do the email addresses come from?',
    a: 'From the companies’ own websites. nvoke opens a handful of pages per site (home, contact, about, team, imprint, privacy) and reads the addresses published there, including ones written as "name [at] domain [dot] com". It does not buy lists or guess addresses.',
  },
  {
    q: 'May I send marketing email to these addresses?',
    a: 'Not without checking the rules in the recipient’s country first. In Denmark, section 10 of the Marketing Practices Act requires prior consent for marketing email, also to businesses, info@ addresses and employees, and much of the EU is similar. nvoke is a research tool: it tells you who a company is and how it publishes its contact details. It does not give you permission to email anyone, and you are responsible for how you use the results.',
  },
  {
    q: 'What counts toward my monthly limit?',
    a: `Only addresses whose mailbox check comes back valid, and each address counts once in any 12 months. Invalid, risky, catch-all and unknown results are free. The Free plan includes ${freeEmails} a month. When you reach your limit, a running search stops with no overage charge, and you can upgrade or wait for the next month.`,
  },
  {
    q: 'Does nvoke send any email?',
    a: 'No. The mailbox check talks to the mail server and stops before a message would be sent. nvoke has no sending feature.',
  },
  {
    q: 'Do I need to keep my computer on while a search runs?',
    a: 'No. The search runs on our servers. You need an internet connection to start a search and to see the results.',
  },
  {
    q: 'Why does Windows or macOS warn me when I install it?',
    a: 'The installers are not code signed yet. The download page explains the one extra click it takes on each system.',
  },
  {
    q: 'I run a website. How do I keep nvoke off it?',
    a: (
      <>
        Block <code className="font-mono text-sm text-foreground">nvokebot</code> in your robots.txt, or opt out your
        domain or your own address on the{' '}
        <Link href="/opt-out" className="text-foreground underline underline-offset-4">
          opt-out page
        </Link>
        . It works at once. The{' '}
        <Link href="/bot" className="text-foreground underline underline-offset-4">
          nvokebot page
        </Link>{' '}
        explains what the crawler does.
      </>
    ),
  },
];

/** A floating slice of the app, without window chrome. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="glass-strong size-full overflow-hidden rounded-[28px] p-8 text-foreground">
      {children}
    </div>
  );
}

function StepShot({ index }: { index: number }) {
  if (index === 0) {
    return (
      <MockFit width={620} height={470} label="The new search form, set to find dentists in Copenhagen.">
        <Panel>
          <NewSearchForm />
        </Panel>
      </MockFit>
    );
  }
  if (index === 1) {
    return (
      <MockFit width={620} height={330} label="A running search: 27 of 44 websites crawled, 36 emails found so far.">
        <Panel>
          <div className="pb-4">
            <div className="font-display text-[34px] leading-[40px] font-semibold tracking-[-0.03em]">Searches</div>
            <div className="mt-1 text-[13px] text-muted-foreground">5 searches, 1 running</div>
          </div>
          <div className="-mx-5 flex flex-col gap-1">
            <SearchRow index={0} compact />
            <SearchRow index={1} compact />
          </div>
        </Panel>
      </MockFit>
    );
  }
  return (
    <MockFit width={620} height={330} label="Dentists in Copenhagen with verified emails, ready to export as CSV.">
      <Panel>
        <div className="flex items-start gap-4 pb-4">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[28px] leading-[34px] font-semibold tracking-[-0.026em]">
              Dentists in Copenhagen
            </div>
            <div className="mt-1 text-[13px] text-muted-foreground">46 valid of 83</div>
          </div>
          <MockButton icon={Download}>Export CSV</MockButton>
        </div>
        <div className="-mx-8">
          {DENTISTS.slice(0, 2).map((c) => (
            <CompanyRow key={c.domain} company={c} location={false} />
          ))}
        </div>
      </Panel>
    </MockFit>
  );
}

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
            Search for dentists in Copenhagen, a keyword on the web, or products launched this week. nvoke finds the
            companies, reads their websites and gives you the contact details they publish, with every email address
            verified by its mail server.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="xl">
              <Link href="/download">Download nvoke</Link>
            </Button>
            <Button asChild size="xl" variant="glass">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Windows, macOS and Linux. Free plan with {freeEmails} verified emails a month.
          </p>
        </Container>
        <div className="relative mx-auto mt-24 w-full max-w-[1240px] px-4 pb-24 sm:mt-36 sm:px-6 sm:pb-36">
          <Stage
            width={1200}
            height={760}
            motion="tilt"
            halo="strong"
            label="The nvoke app on Windows, showing a running search for bakeries in Aarhus with verified emails arriving."
          >
            <WindowsResultsWindow animate />
          </Stage>
        </div>
      </section>

      <Section
        id="how-it-works"
        title="How it works"
        intro="Three steps from a rough idea of the companies you want to work with to a list of their public contact details."
      >
        <ol className="flex flex-col gap-28 sm:gap-44">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
              <div className={i % 2 === 1 ? 'lg:order-2' : undefined}>
                <span className="text-sm font-medium text-muted-foreground tabular-nums">Step {i + 1}</span>
                <h3 className="mt-4 text-title font-semibold text-balance">{step.title}</h3>
                <p className="mt-5 max-w-md text-lg text-pretty text-muted-foreground">{step.body}</p>
              </div>
              <div className="reveal relative">
                <div aria-hidden="true" className="aura absolute -inset-[14%] rounded-full opacity-70" />
                <div className="relative">
                  <StepShot index={i} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="searches"
        title="Three ways to find companies"
        intro="Each search kind starts from a different place. All three end the same way: a list of companies with checked email addresses."
      >
        <div className="mx-auto max-w-5xl">
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
        </div>
      </Section>

      <section id="desktop" aria-labelledby="desktop-title" className="overflow-hidden py-24 sm:py-36">
        <Container>
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
            <h2 id="desktop-title" className="text-headline font-semibold text-balance">
              A desktop app, not another browser tab
            </h2>
            <p className="max-w-2xl text-lede text-pretty text-muted-foreground">
              Most lead tools live in a web page or a Chrome extension. nvoke is a program you install on Windows,
              macOS or Linux.
            </p>
          </div>
        </Container>
        <div className="mx-auto mt-16 w-full max-w-[1240px] px-4 sm:mt-28 sm:px-6">
          <Stage
            width={1200}
            height={680}
            label="The nvoke app on macOS: the list of searches, with the command bar open to jump to Dentists in Copenhagen."
          >
            <MacCommandWindow />
          </Stage>
        </div>
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

      <section id="verification" aria-labelledby="verification-title" className="py-24 sm:py-36">
        <Container className="grid items-start gap-16 lg:grid-cols-[1fr_1.05fr] lg:gap-24">
          <div className="flex flex-col gap-6">
            <h2 id="verification-title" className="text-title font-semibold text-balance sm:text-[3.5rem] sm:leading-[1.02]">
              Every address is checked with its mail server
            </h2>
            <p className="text-lede text-pretty text-muted-foreground">
              A published address is not always a working one. nvoke asks each address’s mail server whether the
              mailbox exists, without sending anything, so you know which details are current.
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
              Results are kept for 30 days, so the same address is not checked again and again.
            </p>
          </div>
          <div className="reveal relative lg:sticky lg:top-28">
            <div aria-hidden="true" className="aura absolute -inset-[12%] rounded-full opacity-80" />
            <VerificationTrace className="relative" />
          </div>
        </Container>
      </section>

      <Section
        id="pricing"
        title="Pay for emails that work"
        intro={`One plan for everyone, with every feature. You pay only for verified emails: ${freeEmails} free every month, then from ${cheapest}.`}
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
            Run your first search in the next ten minutes.
          </h2>
          <p className="mt-5 max-w-xl text-lede text-pretty text-muted-foreground">
            Download nvoke, sign in, and search for the companies you want to work with. The Free plan includes{' '}
            {freeEmails} verified emails a month.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl">
              <Link href="/download">Download nvoke</Link>
            </Button>
            <Button asChild size="xl" variant="glass">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

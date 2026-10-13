import Link from 'next/link';
import { AppMockup } from '@/components/mockups/app-mockup';
import { SaveDialogMockup } from '@/components/mockups/save-dialog-mockup';
import { SearchFormMockup, type SearchKind } from '@/components/mockups/search-form-mockup';
import { VerificationBadge, verificationInfo, type Verification } from '@/components/mockups/verification-badge';
import { VerificationTrace } from '@/components/mockups/verification-trace';
import { Faq, type FaqItem } from '@/components/site/faq';
import { PricingCards } from '@/components/site/pricing-cards';
import { Container, Section } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';

const freePlan = pricing.plans.find((p) => p.id === 'free');
const freeEmails = formatCount(freePlan?.emailsPerMonth ?? 50);

const STEPS = [
  {
    title: 'Say who you want to reach',
    body: 'Pick a search kind and fill in two fields, for example "dentists" and "Copenhagen". Choose how many companies to look at.',
  },
  {
    title: 'nvoke reads their websites',
    body: 'Our servers find the companies, open up to eight pages on each site (home, contact, about, team, imprint) and collect the email addresses published there.',
  },
  {
    title: 'Export the addresses that work',
    body: 'Every address is checked with its mail server. Filter to the valid ones, copy them, or save a CSV for your CRM or mail tool.',
  },
];

const KINDS: { kind: SearchKind; title: string; body: string; source: string }[] = [
  {
    kind: 'local',
    title: 'Local businesses',
    body: 'A trade and a place. nvoke looks them up on OpenStreetMap and keeps the businesses that list a website. Good for clinics, workshops, restaurants and shops in one city or region.',
    source: 'Source: OpenStreetMap',
  },
  {
    kind: 'web',
    title: 'Web search',
    body: 'A keyword and an optional country. nvoke runs a web search, keeps the company domains and drops social networks, marketplaces, Wikipedia and news sites.',
    source: 'Source: Brave Search',
  },
  {
    kind: 'launches',
    title: 'New launches',
    body: 'Products launched in the last days or weeks, with an optional keyword. Useful when you sell to startups and want to reach them early.',
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
    a: 'That depends on where you and the recipient are. In Denmark and much of the EU, unsolicited marketing email usually needs prior consent, also when the recipient is a business. nvoke gives you published contact details. You are responsible for how you use them, so check the rules for your market before you send.',
  },
  {
    q: 'What counts toward my monthly limit?',
    a: `Each email address nvoke finds and checks for you counts once. The Free plan includes ${freeEmails} a month. When you reach your limit, a running search stops, and you can upgrade or wait for the next month.`,
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
        Block <code className="font-mono text-sm text-foreground">nvokebot</code> in your robots.txt, or ask us to add
        your domain to the opt-out list. The{' '}
        <Link href="/bot" className="text-foreground underline underline-offset-4">
          nvokebot page
        </Link>{' '}
        explains both.
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 sm:pt-24">
        <Container>
          <div className="flex max-w-4xl flex-col gap-6">
            <h1 className="text-5xl leading-[0.98] font-semibold tracking-tighter text-balance sm:text-6xl lg:text-7xl">
              {site.tagline}
            </h1>
            <p className="max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
              Search for dentists in Copenhagen, a keyword on the web, or products launched this week. nvoke finds the
              companies, reads their websites and hands you business email addresses that are checked to receive mail.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg">
                <Link href="/download">Download nvoke</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Windows, macOS and Linux. Free plan with {freeEmails} verified emails a month.
            </p>
          </div>
        </Container>
        <div className="relative mt-14 sm:mt-20">
          <div aria-hidden="true" className="absolute inset-x-0 top-1/3 bottom-0 border-t bg-sidebar" />
          <Container className="relative pb-16 sm:pb-24">
            <AppMockup />
          </Container>
        </div>
      </section>

      <Section
        id="how-it-works"
        title="How it works"
        intro="Three steps from a rough idea of your customers to a file of addresses you can use."
      >
        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3 border-t pt-6">
              <span className="text-5xl font-semibold tracking-tighter text-muted-foreground/60 tabular-nums">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-pretty text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="searches"
        className="border-y bg-sidebar"
        title="Three ways to find companies"
        intro="Each search kind starts from a different place. All three end the same way: a list of companies with checked email addresses."
      >
        <div className="grid gap-12 lg:grid-cols-3 lg:gap-8">
          {KINDS.map((k) => (
            <article key={k.kind} className="flex flex-col gap-5">
              <SearchFormMockup kind={k.kind} className="shadow-sm" />
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold">{k.title}</h3>
                <p className="text-pretty text-muted-foreground">{k.body}</p>
                <p className="text-sm text-muted-foreground/80">{k.source}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="desktop"
        title="A desktop app, not another browser tab"
        intro="Most lead tools live in a web page or a Chrome extension. nvoke is a program you install on Windows, macOS or Linux."
      >
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <dl className="grid gap-8 sm:grid-cols-2">
            {DESKTOP_POINTS.map((p) => (
              <div key={p.title} className="flex flex-col gap-2">
                <dt className="font-semibold">{p.title}</dt>
                <dd className="text-pretty text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
          <SaveDialogMockup />
        </div>
      </Section>

      <Section
        id="verification"
        className="border-y bg-sidebar"
        title="Every address is checked with its mail server"
        intro="Mail to dead addresses bounces and hurts your sender reputation. nvoke asks each address’s mail server whether the mailbox exists, without sending anything."
      >
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <VerificationTrace className="shadow-sm" />
          <div className="flex flex-col gap-6">
            <h3 className="text-lg font-semibold">What the results mean</h3>
            <dl className="flex flex-col gap-5">
              {STATUSES.map((s) => (
                <div key={s} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-4">
                  <dt>
                    <VerificationBadge status={s} />
                  </dt>
                  <dd className="text-pretty text-muted-foreground">{verificationInfo[s].meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">
              Results are kept for 30 days, so the same address is not checked again and again.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="pricing"
        title="Pay for the addresses you get"
        intro="Every plan has all three search kinds, verification and CSV export. The plans differ in how many verified emails you get each month."
      >
        <PricingCards compact />
        <p className="mt-6 text-sm text-muted-foreground">
          {pricing.vatNote}{' '}
          <Link href="/pricing" className="text-foreground underline underline-offset-4">
            Compare plans
          </Link>
        </p>
      </Section>

      <Section id="faq" className="border-t" title="Questions">
        <Faq items={FAQ} />
      </Section>

      <section className="pb-20 sm:pb-28">
        <Container>
          <div className="flex flex-col items-start gap-6 rounded-2xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 sm:py-16">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Run your first search in the next ten minutes.
            </h2>
            <p className="max-w-xl text-primary-foreground/75">
              Download nvoke, sign in, and search for the companies you want to reach. The Free plan includes{' '}
              {freeEmails} verified emails a month.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link href="/download">Download nvoke</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

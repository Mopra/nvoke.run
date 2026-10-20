import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Faq, type FaqItem } from '@/components/site/faq';
import { RevealHeading } from '@/components/site/home/reveal';
import { Container } from '@/components/site/section';
import { VsCalculator } from '@/components/site/vs-calculator';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { COMPETITORS, type Competitor } from '@/lib/vs';

type Content = {
  headline: string;
  intro: string;
  /** Where the competitor is the better pick. Say it plainly. */
  theyWin: string[];
  weWin: string[];
  faq: FaqItem[];
};

const CONTENT: Record<Competitor['slug'], Content> = {
  hunter: {
    headline: 'nvoke vs Hunter',
    intro:
      'Both find work emails for a company. Hunter is a mature all-round outreach tool. nvoke is cheaper per verified email and bills only for addresses that pass the mailbox check.',
    theyWin: [
      'A Chrome extension, a Discover database with filters and a built-in sequence sender for cold email campaigns.',
      'A longer track record and more integrations. If you want one tool to find and send, Hunter does both.',
      'You can connect your own email accounts and run outreach from the same place.',
    ],
    weWin: [
      'You pay for verified emails only. Invalid, risky, catch-all and unknown results are free, and an address you already paid for is never charged twice.',
      'Every feature is on every plan, including the API and the MCP server for AI agents. The plan only sets the monthly allowance.',
      'Emails come from the company’s own website and are checked with its mail server.',
      'In your browser with nothing to install, or as nvoke Desktop if you want hotkeys and a local copy.',
    ],
    faq: [
      {
        q: 'Is Hunter’s free plan better than yours?',
        a: 'Hunter’s free plan gives 50 credits a month. Ours gives 50 verified emails a month with every feature and no card. They are close, so try both on your own list.',
      },
      {
        q: 'Does nvoke send campaigns like Hunter?',
        a: 'No. nvoke finds and verifies, then you export a CSV or use the API. Send with whatever you already use.',
      },
      {
        q: 'How was the price calculated?',
        a: 'From the plans on Hunter’s pricing page on the date shown under the calculator, assuming one credit per verified email. Hunter charges in euros, so the saving uses an approximate exchange rate.',
      },
    ],
  },
  snov: {
    headline: 'nvoke vs Snov.io',
    intro:
      'Snov.io bundles a finder, a verifier, drip campaigns and LinkedIn automation. nvoke does the finding and verifying only, and charges one price for both.',
    theyWin: [
      'Drip campaigns, email warm-up and LinkedIn automation in the same account.',
      'If you want the whole outreach stack from one vendor, Snov.io covers more of it.',
    ],
    weWin: [
      'One charge per verified email. On Snov.io, finding and verifying are separate credits, so a verified email costs two.',
      'Failed checks are free: invalid, risky, catch-all and unknown results never use your allowance.',
      'Every feature on every plan, including API access and export, which Snov.io’s trial plan leaves out.',
      `Plans from ${formatPrice(pricing.cheapest.price)} a month, where Snov.io starts at $39.`,
    ],
    faq: [
      {
        q: 'Why do you count two credits per email for Snov.io?',
        a: 'Their pricing page says each email verification and each prospect costs 1 credit. If you only need to verify addresses you already have, the real gap is smaller. Enter half the number in the calculator to see it.',
      },
      {
        q: 'Do you have LinkedIn automation?',
        a: 'No. nvoke does not touch LinkedIn. It finds companies and their published emails.',
      },
      {
        q: 'How was the price calculated?',
        a: 'From the plans on Snov.io’s pricing page on the date shown under the calculator. Yearly prices are only shown where Snov.io lists a yearly saving.',
      },
    ],
  },
  apollo: {
    headline: 'nvoke vs Apollo',
    intro:
      'Apollo is a sales platform with a huge people database, sequences and a dialer. nvoke is a smaller, cheaper tool for one job: verified company emails.',
    theyWin: [
      'A large database of people, with titles, filters and phone numbers. nvoke has no phone numbers.',
      'Sequences, a dialer, CRM sync and intent data in one platform for a sales team.',
    ],
    weWin: [
      'No per-seat pricing. One plan for everyone, priced by verified emails.',
      'You pay only when the mailbox check says an address is valid.',
      'Emails come from the company’s own website, not from a database that may be old.',
      'A plain API and an MCP server, on every plan including free.',
    ],
    faq: [
      {
        q: 'Does Apollo’s database have people I will not find with nvoke?',
        a: 'Yes. Apollo lists individuals by role. nvoke finds the addresses a company publishes itself. If you need a named VP of sales at a big company, use Apollo. If you need the contact email of a small business, nvoke fits.',
      },
      {
        q: 'How do you compare per-seat plans?',
        a: 'The calculator adds Apollo seats until the credits cover the volume, one credit per email. Organization needs at least three seats.',
      },
      {
        q: 'How was the price calculated?',
        a: 'From the plans on Apollo’s pricing page on the date shown under the calculator, for both monthly and yearly billing.',
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(COMPETITORS).map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = COMPETITORS[slug as Competitor['slug']];
  if (!c) return {};
  const content = CONTENT[c.slug];
  return {
    title: `${content.headline}: price calculator and honest comparison`,
    description: `${content.intro} Compare what your monthly volume costs, with ${c.name}’s prices read on ${c.readOn}.`,
    alternates: { canonical: `/vs/${c.slug}` },
  };
}

/** A part of the page: a hairline, a printed label, a headline that rises in. */
function Part({ id, label, title, children }: { id: string; label: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t py-20 sm:py-28">
      <p className="cap text-muted-foreground">{label}</p>
      <RevealHeading id={`${id}-title`} className="mt-6 max-w-3xl text-headline font-light" lines={[title]} />
      <div className="mt-12 sm:mt-16">{children}</div>
    </section>
  );
}

export default async function VsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPETITORS[slug as Competitor['slug']];
  if (!c) notFound();
  const content = CONTENT[c.slug];
  const free = formatCount(pricing.free.emailsPerMonth);
  const cheapest = `${formatPrice(pricing.cheapest.price)} a month for ${formatCount(pricing.cheapest.emailsPerMonth)}`;
  const others = Object.values(COMPETITORS).filter((o) => o.slug !== c.slug);

  return (
    <Container>
      {/* The head and the calculator: the two displays counting the bill are the hero. */}
      <section aria-labelledby="vs-title" className="pt-20 pb-20 sm:pt-32 sm:pb-28">
        <nav aria-label="Breadcrumb">
          <ol className="cap flex items-center gap-2 text-muted-foreground">
            <li>Compare</li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-primary">
              vs {c.name}
            </li>
          </ol>
        </nav>
        <RevealHeading as="h1" id="vs-title" className="mt-6 max-w-4xl text-display font-light" lines={[content.headline]} />
        <p className="mt-6 max-w-2xl text-lede text-pretty text-muted-foreground">{content.intro}</p>
        <p className="cap mt-6 text-muted-foreground">
          nvoke: {free} free a month, then from {cheapest}
        </p>
        <div className="mt-16 sm:mt-24">
          <VsCalculator slug={c.slug} />
        </div>
      </section>

      <Part id="where" label="Honest" title="Who wins where.">
        <div className="grid gap-16 md:grid-cols-2 md:gap-10">
          {[
            { title: `Pick ${c.name} when`, items: content.theyWin },
            { title: 'Pick nvoke when', items: content.weWin },
          ].map((side) => (
            <div key={side.title} className="flex flex-col">
              <h3 className="text-title font-light">{side.title}</h3>
              <ul className="mt-8 border-b">
                {side.items.map((t, i) => (
                  <li key={t} className="grid grid-cols-[2.25rem_1fr] gap-2 border-t py-4 text-[15px] text-pretty text-muted-foreground">
                    <span className="cap pt-0.5 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Part>

      <section id="faq" aria-labelledby="faq-title" className="grid gap-12 border-t py-20 sm:py-28 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <RevealHeading id="faq-title" className="text-headline font-light" lines={['Questions.']} />
        <Faq items={content.faq} />
      </section>

      <section aria-labelledby="close-title" className="flex flex-col items-center border-t py-24 text-center sm:py-36">
        <RevealHeading id="close-title" className="max-w-3xl text-display font-light" lines={['Try it on', 'your own list.']} />
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Button asChild size="xl" variant="dark">
            <Link href="/sign-up">Start free</Link>
          </Button>
          <Button asChild size="xl" variant="secondary">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
        <p className="cap mt-6 text-muted-foreground">{free} verified emails a month, free</p>
        <p className="mt-12 text-[15px] text-muted-foreground">
          Other comparisons:{' '}
          {others.map((o, i) => (
            <span key={o.slug}>
              {i > 0 ? ', ' : ''}
              <Link href={`/vs/${o.slug}`} className="text-foreground underline underline-offset-4">
                {o.name}
              </Link>
            </span>
          ))}
          .
        </p>
      </section>
    </Container>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Faq, type FaqItem } from '@/components/site/faq';
import { Container, PageHeader, Section } from '@/components/site/section';
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
        a: 'From the plans on Hunter’s pricing page on the date shown above the calculator, assuming one credit per verified email. Hunter charges in euros, so the saving uses an approximate exchange rate.',
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
      'Plans from $5 a month, where Snov.io starts at $39.',
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
        a: 'From the plans on Snov.io’s pricing page on the date shown above the calculator. Yearly prices are only shown where Snov.io lists a yearly saving.',
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
        a: 'From the plans on Apollo’s pricing page on the date shown above the calculator, for both monthly and yearly billing.',
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

export default async function VsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPETITORS[slug as Competitor['slug']];
  if (!c) notFound();
  const content = CONTENT[c.slug];
  const free = formatCount(pricing.free.emailsPerMonth);
  const cheapest = `${formatPrice(pricing.cheapest.price)} a month for ${formatCount(pricing.cheapest.emailsPerMonth)}`;
  const others = Object.values(COMPETITORS).filter((o) => o.slug !== c.slug);

  return (
    <>
      <PageHeader title={content.headline} intro={content.intro} />

      <Section
        title="What your volume costs"
        intro={`Type how many verified emails you need each month. nvoke is free for ${free} a month, then from ${cheapest}.`}
      >
        <VsCalculator slug={c.slug} />
      </Section>

      <Section title="Who wins where" align="left">
        <div className="grid gap-12 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-2xl font-medium">Pick {c.name} when</h3>
            <ul className="flex list-disc flex-col gap-3 pl-5 text-pretty text-muted-foreground">
              {content.theyWin.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-2xl font-medium">Pick nvoke when</h3>
            <ul className="flex list-disc flex-col gap-3 pl-5 text-pretty text-muted-foreground">
              {content.weWin.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Questions">
        <div className="mx-auto max-w-3xl">
          <Faq items={content.faq} />
        </div>
      </Section>

      <Container className="pb-24 text-center sm:pb-36">
        <div className="flex flex-col items-center gap-5">
          <h2 className="text-headline font-semibold text-balance">Try it on your own list</h2>
          <Button asChild size="xl">
            <Link href="/sign-up">Start free</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            In your browser, nothing to install. Other comparisons:{' '}
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
        </div>
      </Container>
    </>
  );
}

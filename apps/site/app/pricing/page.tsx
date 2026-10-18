import type { Metadata } from 'next';
import Link from 'next/link';
import { Faq, type FaqItem } from '@/components/site/faq';
import { PricingSlider } from '@/components/site/pricing-slider';
import { Container, Eyebrow, PageHeader } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';

const free = formatCount(pricing.free.emailsPerMonth);
const cheapest = `${formatPrice(pricing.cheapest.price)} a month for ${formatCount(pricing.cheapest.emailsPerMonth)}`;
const top = formatCount(pricing.top.emailsPerMonth);

export const metadata: Metadata = {
  title: 'Pricing',
  description: `One plan, priced by verified emails. ${free} free a month, then from ${cheapest}. Addresses that fail the check cost nothing.`,
  alternates: { canonical: '/pricing' },
};

const FAQ: FaqItem[] = [
  {
    q: 'What counts as a verified email?',
    a: 'An address whose mailbox check came back valid. Invalid, risky, catch-all and unknown are free. Generic addresses like info@ count when valid, because at most companies that is the inbox someone actually reads. An address you already paid for never counts again, in any later search.',
  },
  {
    q: 'What happens when I reach my limit?',
    a: 'The running search stops cleanly. You keep everything found so far. No overage charge, no surprise bill. Need more? Move up a plan under Account in the app, and it applies at once.',
  },
  {
    q: 'Do unused emails roll over?',
    a: 'No. Your allowance resets on the first of each calendar month (UTC). Pick the plan that fits your month. Change it whenever.',
  },
  {
    q: 'Is there a free plan?',
    a: `Yes. ${free} verified emails a month. Every feature: every search kind, verification, CSV export. No card.`,
  },
  {
    q: 'Can I cancel at any time?',
    a: 'Yes. Your paid plan runs to the end of the period you paid for, then drops to Free. Your searches and results stay.',
  },
  {
    q: 'Do you offer invoices with VAT?',
    a: `Yes. ${pricing.vatNote} Every payment comes with a receipt. EU businesses with a valid VAT number get reverse charge. Need something specific on the invoice? Write to ${site.email.hello}.`,
  },
];

const INCLUDED = [
  'Every search kind',
  'Mailbox verification',
  'CSV export',
  'API and MCP',
  'Unlimited searches',
  'Unlimited companies',
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Pay for emails that work."
        intro={`One plan. You pay for verified emails and nothing else. ${free} free a month, then from ${cheapest}.`}
      />
      <Container className="pb-6">
        <PricingSlider />
        <div className="mx-auto mt-10 max-w-3xl">
          <p className="cap text-muted-foreground">Every plan</p>
          <ul className="mt-3 grid border-b sm:grid-cols-2 sm:gap-x-8">
            {INCLUDED.map((item) => (
              <li key={item} className="cap flex items-center gap-2 border-t py-2.5 text-foreground">
                <span className="text-primary">+</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[15px] text-pretty text-muted-foreground">
            {pricing.vatNote} Need more than {top} a month?{' '}
            <a href={`mailto:${site.email.hello}`} className="text-foreground underline underline-offset-4">
              Talk to us
            </a>
            .
          </p>
        </div>
      </Container>

      <section aria-labelledby="pricing-faq" className="py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div className="flex flex-col gap-5">
            <Eyebrow>Questions</Eyebrow>
            <h2 id="pricing-faq" className="text-headline font-light">
              The fine print.
            </h2>
          </div>
          <Faq items={FAQ} />
        </Container>
      </section>

      <section aria-labelledby="pricing-cta" className="pb-10">
        <Container>
          <div className="panel flex flex-col items-center gap-6 px-5 py-14 text-center sm:py-20">
            <h2 id="pricing-cta" className="text-headline font-light">
              Start free. Pay when it works.
            </h2>
            <p className="max-w-lg text-lede text-pretty text-muted-foreground">
              In your browser, nothing to install. Power user? Get nvoke Desktop.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button asChild size="xl" variant="dark">
                <Link href="/sign-up">Start free</Link>
              </Button>
              <Button asChild size="xl" variant="secondary">
                <Link href="/download">nvoke Desktop</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

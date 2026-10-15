import type { Metadata } from 'next';
import Link from 'next/link';
import { Faq, type FaqItem } from '@/components/site/faq';
import { PricingSlider } from '@/components/site/pricing-slider';
import { Container, PageHeader, Section } from '@/components/site/section';
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

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Pay for emails that work"
        intro={`One plan. You pay for verified emails and nothing else. ${free} free a month, then from ${cheapest}.`}
      />
      <Container className="pb-24 sm:pb-36">
        <PricingSlider />
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-pretty text-muted-foreground">
          Every plan gets{' '}
          <span className="font-medium text-foreground">
            every search kind, mailbox verification, CSV export, unlimited searches and companies
          </span>
          . {pricing.vatNote}
        </p>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Need more than {top} a month?{' '}
          <a href={`mailto:${site.email.hello}`} className="text-foreground underline underline-offset-4">
            Talk to us
          </a>
          .
        </p>
      </Container>

      <Section title="Questions">
        <div className="mx-auto max-w-3xl">
          <Faq items={FAQ} />
        </div>
      </Section>

      <section className="relative overflow-hidden py-28 sm:py-44">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 h-[34rem] w-[60rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2"
        >
          <div className="aura absolute inset-0 rounded-full motion-safe:animate-breathe" />
        </div>
        <Container className="relative flex flex-col items-center gap-12 text-center">
          <h2 className="text-headline font-semibold text-balance">Start free. Pay when it works.</h2>
          <div className="flex flex-col items-center gap-5">
            <Button asChild size="xl">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              In your browser, nothing to install. Power user?{' '}
              <Link href="/download" className="text-foreground underline underline-offset-4">
                Get nvoke Desktop
              </Link>
              .
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Faq, type FaqItem } from '@/components/site/faq';
import { RevealHeading } from '@/components/site/home/reveal';
import { ChargeDemo } from '@/components/site/pricing/charge-demo';
import { Included } from '@/components/site/pricing/included';
import { PricingSlider } from '@/components/site/pricing-slider';
import { Container, PageHeader } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';

const free = formatCount(pricing.free.emailsPerMonth);
const cheapest = `${formatPrice(pricing.cheapest.price)} a month for ${formatCount(pricing.cheapest.emailsPerMonth)}`;

export const metadata: Metadata = {
  title: 'Pricing',
  description: `One plan, priced by verified emails. ${free} free a month, then from ${cheapest}. Addresses that fail the check cost nothing.`,
  alternates: { canonical: '/pricing' },
};

const FAQ: FaqItem[] = [
  {
    q: 'What counts as a verified email?',
    a: 'An address whose mailbox check came back valid. Invalid, risky, catch-all and unknown are free. A valid info@ counts too: at most companies that is the inbox someone reads. An address you paid for never counts again.',
  },
  {
    q: 'Why do Describe your customer emails count more?',
    a: `Each one counts ${pricing.icpTimes}. Claude plans that search, scores every company it finds and pays for web search, so a lead costs us more to make. Every other search counts one.`,
  },
  {
    q: 'What happens when I reach my limit?',
    a: 'The running search stops cleanly and you keep what it found. No overage, no surprise bill. Move up a plan and it applies at once.',
  },
  {
    q: 'Do unused emails roll over?',
    a: 'No. Your allowance resets on the first of each month (UTC). Change plan whenever.',
  },
  {
    q: 'Is there a free plan?',
    a: `Yes. ${free} verified emails a month with every feature. No card.`,
  },
  {
    q: 'Can I cancel at any time?',
    a: 'Yes. Your plan runs to the end of the paid period, then drops to Free. Your searches and results stay.',
  },
  {
    q: 'Do you offer invoices with VAT?',
    a: `Yes. ${pricing.vatNote} Every payment comes with a receipt. EU businesses with a valid VAT number get reverse charge. Need something on the invoice? Write to ${site.email.hello}.`,
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader eyebrow="Pricing" title="Pay for emails that work." intro={`One plan. ${free} free a month, then from ${cheapest}.`} />

      {/* The ladder on the hero screen, the step row and the keys under it. */}
      <section aria-label="Plans" className="pb-20 sm:pb-28">
        <Container>
          <PricingSlider />
        </Container>
      </section>

      {/* The rule, shown: a verify run where only valid addresses are billed. */}
      <section aria-labelledby="counts-title" className="py-20 sm:py-28">
        <Container className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <div>
            <RevealHeading id="counts-title" className="text-headline font-light" lines={['Only valid counts.']} />
            <p className="mt-5 max-w-sm text-lede text-pretty text-muted-foreground">
              Invalid, risky, catch-all and unknown are free. An address you paid for never counts twice.
            </p>
          </div>
          <ChargeDemo />
        </Container>
      </section>

      <section aria-labelledby="included-title" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="included-title" className="max-w-2xl text-headline font-light" lines={['Every feature.', 'Every plan.']} />
          <p className="mt-5 max-w-md text-lede text-pretty text-muted-foreground">Plans differ in one number.</p>
          <Included />
        </Container>
      </section>

      <section aria-labelledby="pricing-faq" className="py-20 sm:py-28">
        <Container className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <RevealHeading id="pricing-faq" className="text-headline font-light" lines={['The fine print.']} />
          <Faq items={FAQ} />
        </Container>
      </section>

      <section aria-labelledby="pricing-cta" className="pt-20 pb-24 sm:pt-28 sm:pb-36">
        <Container className="flex flex-col items-center text-center">
          <RevealHeading id="pricing-cta" className="max-w-4xl text-display font-light" lines={['Start free.', 'Pay when it works.']} />
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl" variant="dark">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <Button asChild size="xl" variant="secondary">
              <Link href="/download">nvoke Desktop</Link>
            </Button>
          </div>
          <p className="cap mt-6 text-muted-foreground">In your browser. Nothing to install.</p>
        </Container>
      </section>
    </>
  );
}

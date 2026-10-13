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
  description: `One plan for everyone, priced by verified emails. ${free} free every month, then from ${cheapest}. You only pay for addresses that pass the mailbox check.`,
  alternates: { canonical: '/pricing' },
};

const FAQ: FaqItem[] = [
  {
    q: 'What counts as a verified email?',
    a: 'An address whose mailbox check came back valid. Invalid, risky, catch-all and unknown results are free. Generic addresses like info@ count when they are valid, because for most companies they are the address that gets read. An address you were already charged for never counts again, in any later search.',
  },
  {
    q: 'What happens when I reach my limit?',
    a: 'The running search stops cleanly and you keep everything found so far. There is no overage charge and no surprise bill. Need more room? Move up a plan in a couple of clicks from the app.',
  },
  {
    q: 'Do unused emails roll over?',
    a: 'No. Your allowance resets at the start of each calendar month (UTC). Pick the plan that fits your month and change it whenever.',
  },
  {
    q: 'Is there a free plan?',
    a: `Yes. ${free} verified emails a month with every feature, all three search kinds, verification and CSV export. No card needed.`,
  },
  {
    q: 'Can I cancel at any time?',
    a: 'Yes. Your paid plan runs until the end of the period you paid for, then the account moves to the Free plan. Your searches and results stay.',
  },
  {
    q: 'Do you offer invoices with VAT?',
    a: `Yes. ${pricing.vatNote} Every payment comes with a receipt. Business customers in the EU with a valid VAT number are invoiced with reverse charge. Write to ${site.email.hello} if you need something specific on the invoice.`,
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Pay for emails that work"
        intro={`One plan for everyone. You pay for verified emails, nothing else. Start with ${free} free every month, then from ${cheapest}.`}
      />
      <Container className="pb-24 sm:pb-36">
        <PricingSlider />
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-pretty text-muted-foreground">
          Every plan includes{' '}
          <span className="font-medium text-foreground">
            all three search kinds, mailbox verification, CSV export, and unlimited searches and companies
          </span>
          . {pricing.vatNote}
        </p>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Need more than {top} a month?{' '}
          <a href={`mailto:${site.email.hello}`} className="text-foreground underline underline-offset-4">
            Write to us
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
          <Button asChild size="xl">
            <Link href="/download">Download nvoke</Link>
          </Button>
        </Container>
      </section>
    </>
  );
}

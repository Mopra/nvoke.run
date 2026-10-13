import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import { Faq, type FaqItem } from '@/components/site/faq';
import { PricingCards } from '@/components/site/pricing-cards';
import { Container, PageHeader, Section } from '@/components/site/section';
import { formatCount, formatPrice, pricing, type PlanId } from '@/lib/pricing';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'nvoke has a Free, Pro and Business plan. Every plan includes all search kinds, email verification and CSV export.',
  alternates: { canonical: '/pricing' },
};

type Row = { label: string; value: (id: PlanId) => string | boolean };

const ROWS: Row[] = [
  {
    label: 'Verified emails per month',
    value: (id) => formatCount(pricing.plans.find((p) => p.id === id)?.emailsPerMonth ?? 0),
  },
  { label: 'Local business search', value: () => true },
  { label: 'Web search', value: () => true },
  { label: 'New launches search', value: () => true },
  { label: 'Mailbox verification', value: () => true },
  { label: 'CSV export', value: () => true },
  { label: 'Email support', value: (id) => id !== 'free' },
  { label: 'Priority support', value: (id) => id === 'business' },
];

const FAQ: FaqItem[] = [
  {
    q: 'What is a verified email?',
    a: 'An address nvoke found on a company website and then checked with the mail server. Each address counts once toward your monthly limit, whatever the result of the check.',
  },
  {
    q: 'What happens when I reach my limit?',
    a: 'A running search stops when the limit is reached. You keep everything found so far. Upgrade to continue right away, or wait until the next month starts.',
  },
  {
    q: 'Do unused emails carry over?',
    a: 'No. The limit resets at the start of each calendar month.',
  },
  {
    q: 'Can I cancel at any time?',
    a: 'Yes. Your paid plan runs until the end of the period you paid for, then the account moves to the Free plan. Your searches and results stay.',
  },
  {
    q: 'Do you offer invoices with VAT?',
    a: `Yes. ${pricing.vatNote} Business customers in the EU with a valid VAT number are invoiced with reverse charge. Write to ${site.email.hello} if you need something specific on the invoice.`,
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === 'string') return <span className="font-medium tabular-nums">{value}</span>;
  return value ? (
    <Check className="size-4 text-primary" aria-label="Included" />
  ) : (
    <Minus className="size-4 text-muted-foreground/60" aria-label="Not included" />
  );
}

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Pricing"
        intro="Every plan has all three search kinds, mailbox verification and CSV export. Pick the one that matches how many addresses you need each month."
      />
      <Container className="pb-8">
        <PricingCards />
        <p className="mt-8 text-center text-sm text-muted-foreground">{pricing.vatNote}</p>
      </Container>

      <Section title="Compare plans">
        <div className="mx-auto max-w-4xl overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="px-3 py-4 font-medium text-muted-foreground sm:px-5">
                  <span className="sr-only">Feature</span>
                </th>
                {pricing.plans.map((p) => (
                  <th key={p.id} scope="col" className="px-3 py-4 text-lg font-semibold tracking-[-0.015em] sm:px-5">
                    {p.name}
                    <span className="hidden text-sm font-normal tracking-normal text-muted-foreground sm:block">
                      {formatPrice(p.price)} per month
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b">
                  <th scope="row" className="px-3 py-4 text-left font-normal text-muted-foreground sm:px-5">
                    {row.label}
                  </th>
                  {pricing.plans.map((p) => (
                    <td key={p.id} className="px-3 py-4 sm:px-5">
                      <Cell value={row.value(p.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Billing questions" className="border-t">
        <div className="mx-auto max-w-3xl">
          <Faq items={FAQ} />
        </div>
      </Section>
    </>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { COMPETITORS, EUR_USD, nvokeQuote, quote, toUsd, type Competitor } from '@/lib/vs';
import { formatCount, formatPrice } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const PRESETS = [50, 500, 1_000, 2_500, 7_500, 20_000, 50_000];

function money(amount: number, currency: 'USD' | 'EUR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** What the same monthly volume costs at a competitor and at nvoke, from the dated prices in lib/vs. */
export function VsCalculator({ slug }: { slug: Competitor['slug'] }) {
  const c = COMPETITORS[slug];
  const [emails, setEmails] = useState(2_500);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const them = quote(c, emails, billing);
  const us = nvokeQuote(emails);
  const themUsd = them ? toUsd(c, them.price) : null;
  const saving = themUsd !== null && us ? themUsd - us.price : null;

  return (
    <div className="glass-strong mx-auto flex w-full max-w-3xl flex-col gap-8 rounded-[32px] p-7 text-card-foreground sm:p-12">
      <div className="flex flex-col gap-3">
        <label htmlFor="vs-emails" className="text-sm text-muted-foreground">
          Verified emails you need a month
        </label>
        <input
          id="vs-emails"
          type="number"
          inputMode="numeric"
          min={1}
          max={200_000}
          value={emails}
          onChange={(e) => setEmails(Math.min(200_000, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
          className="w-full rounded-2xl border bg-background px-4 py-3 font-display text-4xl font-extralight tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setEmails(n)}
              className={cn(
                'rounded-full px-3 py-1 text-xs tabular-nums transition-colors',
                n === emails ? 'bg-foreground text-background' : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground',
              )}
            >
              {formatCount(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 text-sm" role="group" aria-label="How you pay the competitor">
        {(['monthly', 'annual'] as const).map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={billing === b}
            onClick={() => setBilling(b)}
            className={cn(
              'rounded-full px-4 py-1.5 transition-colors',
              billing === b ? 'bg-foreground text-background' : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground',
            )}
          >
            {c.name} {b === 'monthly' ? 'billed monthly' : 'billed yearly'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">{c.name}</p>
          {them ? (
            <>
              <p className="font-display text-5xl font-extralight tracking-[-0.045em] tabular-nums">
                {them.price === 0 ? 'Free' : money(them.price, c.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                {them.plan}
                {them.seats > 1 ? `, ${them.seats} seats` : ''}
                {them.price > 0 ? ' per month' : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              More than {c.name} publishes a plan for. You would have to ask their sales team.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">nvoke</p>
          {us ? (
            <>
              <p className="font-display text-5xl font-extralight tracking-[-0.045em] tabular-nums">
                {us.price === 0 ? 'Free' : formatPrice(us.price)}
              </p>
              <p className="text-sm text-muted-foreground">
                {us.plan}
              </p>
            </>
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              More than our top plan. Write to hello@nvoke.run.
            </p>
          )}
        </div>
      </div>

      <p aria-live="polite" className="text-sm text-pretty text-muted-foreground">
        {saving !== null && saving > 0
          ? `About ${formatPrice(Math.round(saving))} a month less with nvoke at this volume.`
          : saving !== null && saving < 0
            ? `At this volume ${c.name} is about ${formatPrice(Math.round(-saving))} a month cheaper. Use it.`
            : saving === 0
              ? 'The same price at this volume.'
              : ''}
      </p>

      <div className="flex flex-col gap-3 text-xs text-pretty text-muted-foreground">
        <p>{c.creditNote}</p>
        <p>
          Prices read from{' '}
          <a href={c.source} rel="noopener" className="underline underline-offset-4">
            {c.source.replace('https://', '')}
          </a>{' '}
          on {new Date(c.readOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.
          {c.currency === 'EUR'
            ? ` ${c.name} shows euros. The saving uses about ${EUR_USD} dollars to the euro.`
            : ''}{' '}
          nvoke is billed monthly, excluding VAT. Competitor prices exclude taxes as they list them. Plans change, so check theirs before you decide.
        </p>
      </div>

      <Button asChild size="lg" className="w-full sm:w-auto sm:self-start">
        <Link href="/sign-up">Start free, 50 verified emails</Link>
      </Button>
    </div>
  );
}

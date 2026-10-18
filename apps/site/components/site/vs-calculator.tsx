'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
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
    <div className="plate flex w-full max-w-3xl flex-col gap-7 rounded-[6px] p-5 text-card-foreground sm:p-8">
      <div className="flex flex-col gap-3">
        <label htmlFor="vs-emails" className="cap text-muted-foreground">
          Verified emails a month
        </label>
        <input
          id="vs-emails"
          type="number"
          inputMode="numeric"
          min={1}
          max={200_000}
          value={emails}
          onChange={(e) => setEmails(Math.min(200_000, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
          className="w-full rounded-[4px] bg-background/60 px-4 py-2 font-display text-4xl font-light tabular-nums shadow-[inset_0_1px_2px_var(--shadow-strong)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 [&::-webkit-inner-spin-button]:appearance-none"
        />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === emails}
              onClick={() => setEmails(n)}
              className={cn(
                'key h-7 bg-secondary px-2.5 font-mono text-[11.5px] font-medium tabular-nums text-secondary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                n === emails ? 'key-down' : 'hover:brightness-[0.97]',
              )}
            >
              {formatCount(n)}
            </button>
          ))}
        </div>
      </div>

      <Segmented
        label={`How you pay ${c.name}`}
        value={billing}
        onChange={setBilling}
        options={[
          { value: 'monthly', label: `${c.name} monthly` },
          { value: 'annual', label: `${c.name} yearly` },
        ]}
        className="self-start"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="screen flex min-h-32 flex-col justify-between gap-3 p-4">
          <p className="cap text-screen-foreground/50">{c.name}</p>
          {them ? (
            <div className="flex flex-col gap-1">
              <p className="lcd text-[40px] leading-none">{them.price === 0 ? 'FREE' : money(them.price, c.currency)}</p>
              <p className="cap text-screen-foreground/50">
                {them.plan}
                {them.seats > 1 ? `, ${them.seats} seats` : ''}
                {them.price > 0 ? ' a month' : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-pretty text-screen-foreground/70">
              More than {c.name} publishes a plan for. Ask their sales team.
            </p>
          )}
        </div>
        <div className="screen flex min-h-32 flex-col justify-between gap-3 p-4">
          <p className="cap text-screen-foreground/50">nvoke</p>
          {us ? (
            <div className="flex flex-col gap-1">
              <p className="lcd text-[40px] leading-none">{us.price === 0 ? 'FREE' : formatPrice(us.price)}</p>
              <p className="cap text-screen-foreground/50">{us.plan}</p>
            </div>
          ) : (
            <p className="text-sm text-pretty text-screen-foreground/70">More than our top plan. Write to hello@nvoke.run.</p>
          )}
        </div>
      </div>

      <p aria-live="polite" className="text-[16px] text-pretty text-foreground">
        {saving !== null && saving > 0
          ? `About ${formatPrice(Math.round(saving))} a month less with nvoke at this volume.`
          : saving !== null && saving < 0
            ? `At this volume ${c.name} is about ${formatPrice(Math.round(-saving))} a month cheaper. Use it.`
            : saving === 0
              ? 'The same price at this volume.'
              : ''}
      </p>

      <div className="flex flex-col gap-3 border-t pt-5 text-xs text-pretty text-muted-foreground">
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { Figure, METER_SEGMENTS, ScreenMeter } from '@/components/mockups/parts';
import { prefersReducedMotion, useInView } from '@/components/site/home/motion';
import { Segmented } from '@/components/ui/segmented';
import { COMPETITORS, EUR_USD, nvokeQuote, quote, toUsd, type Competitor } from '@/lib/vs';
import { formatCount, formatPrice } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const PRESETS = [50, 500, 1_000, 2_500, 7_500, 20_000, 50_000];
const COUNT_MS = 1100;

function money(amount: number, currency: 'USD' | 'EUR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

const ghostOf = (s: string) => s.replace(/\d/g, '8');

/**
 * A number that counts from where it was to `target` once `running` is true,
 * easing out like a meter settling. Reduced motion shows the target at once.
 */
function useCount(target: number, running: boolean) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!running) return;
    if (prefersReducedMotion()) {
      from.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      const v = origin + (target - origin) * eased;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, running]);
  return shown;
}

/** One display of the pair: who, the price counting up over ghost digits, the plan, and a meter of the larger bill. */
function CostDisplay({
  name,
  price,
  format,
  plan,
  share,
  running,
  empty,
  emphasis,
}: {
  name: string;
  price: number | null;
  format: (n: number) => string;
  plan: string;
  /** This bill as a share of the larger of the two, 0 to 1. */
  share: number;
  running: boolean;
  empty: string;
  emphasis?: boolean;
}) {
  const target = price ?? 0;
  const shown = useCount(target, running);
  const settled = Math.abs(shown - target) < 0.005;
  // The currency sign stays put at the left; the digits count up right aligned over their ghost.
  const now = price === null ? '' : price === 0 && settled ? 'FREE' : format(target % 1 === 0 ? Math.round(shown) : Math.round(shown * 100) / 100);
  const end = price === null ? '' : price === 0 ? 'FREE' : format(price);
  const sign = /^\D*/.exec(now)?.[0] ?? '';
  const digits = now.slice(sign.length);
  const endDigits = end.slice((/^\D*/.exec(end)?.[0] ?? '').length);
  const width = Math.max(digits.length, endDigits.length);
  const ghost = sign + ghostOf((digits.length >= endDigits.length ? digits : endDigits).padStart(width, '8'));
  const live = sign + digits.padStart(width, ' ');
  const lit = Math.round(share * METER_SEGMENTS * Math.min(1, target === 0 ? 1 : shown / target));

  return (
    <div className="screen screen-hero flex min-h-60 flex-col p-6 sm:min-h-72 sm:p-8">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn('led', settled ? 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]' : 'led-on motion-safe:animate-blink')}
        />
        <span className={cn('cap', emphasis ? 'text-primary' : 'text-screen-foreground/60')}>{name}</span>
        <span className="cap ml-auto text-screen-foreground/50">A month</span>
      </div>
      {price === null ? (
        <p className="mt-auto pt-10 text-[15px] text-pretty text-screen-foreground/70">{empty}</p>
      ) : (
        <>
          <div className="mt-auto pt-10">
            <Figure value={live} ghost={ghost} className="text-[52px] whitespace-pre sm:text-[80px]" />
          </div>
          <p className="cap mt-4 truncate text-screen-foreground/50">{plan}</p>
          <ScreenMeter lit={emphasis ? lit : 0} dim={emphasis ? 0 : lit} className="mt-5" />
        </>
      )}
    </div>
  );
}

/** What the same monthly volume costs at a competitor and at nvoke, from the dated prices in lib/vs. */
export function VsCalculator({ slug }: { slug: Competitor['slug'] }) {
  const c = COMPETITORS[slug];
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -10% 0px', true);
  const [emails, setEmails] = useState(2_500);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const them = quote(c, emails, billing);
  const us = nvokeQuote(emails);
  const themUsd = them ? toUsd(c, them.price) : null;
  const saving = themUsd !== null && us ? themUsd - us.price : null;
  const larger = Math.max(themUsd ?? 0, us?.price ?? 0);
  const shareOf = (usd: number | null) => (usd === null ? 0 : larger === 0 ? 0 : usd / larger);

  return (
    <div ref={ref} className="flex w-full flex-col">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
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
            className="w-full max-w-sm border-b bg-transparent pb-2 font-display text-[56px] leading-none font-light tracking-[-0.04em] tabular-nums outline-none focus-visible:border-foreground sm:text-[72px] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === emails}
                onClick={() => setEmails(n)}
                className={cn(
                  'key h-8 bg-secondary px-3 font-mono text-[11.5px] font-medium tabular-nums text-secondary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  n === emails ? 'key-down text-primary' : 'hover:brightness-[0.97]',
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
          className="self-start lg:self-auto"
        />
      </div>

      <div className="mt-12 grid gap-4 sm:mt-16 md:grid-cols-2 md:gap-6">
        <CostDisplay
          name={c.name}
          price={them ? them.price : null}
          format={(n) => money(n, c.currency)}
          plan={them ? `${them.plan}${them.seats > 1 ? `, ${them.seats} seats` : ''}` : ''}
          share={shareOf(themUsd)}
          running={inView}
          empty={`More than ${c.name} publishes a plan for. Ask their sales team.`}
        />
        <CostDisplay
          name="nvoke"
          price={us ? us.price : null}
          format={(n) => formatPrice(n)}
          plan={us ? us.plan : ''}
          share={shareOf(us ? us.price : null)}
          running={inView}
          empty="More than our top plan. Write to hello@nvoke.run."
          emphasis
        />
      </div>

      <p aria-live="polite" className="mt-10 min-h-[1.2em] text-title font-light text-pretty">
        {saving !== null && saving > 0
          ? `About ${formatPrice(Math.round(saving))} a month less with nvoke.`
          : saving !== null && saving < 0
            ? `At this volume ${c.name} is about ${formatPrice(Math.round(-saving))} a month cheaper. Use it.`
            : saving === 0
              ? 'The same price at this volume.'
              : ''}
      </p>

      <div className="mt-10 flex max-w-3xl flex-col gap-3 border-t pt-6 text-xs leading-relaxed text-pretty text-muted-foreground">
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
    </div>
  );
}

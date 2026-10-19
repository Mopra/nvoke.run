'use client';

import { useRef, type KeyboardEvent, type Ref } from 'react';
import { Figure, METER_SEGMENTS, ScreenMeter } from '@/components/mockups/parts';
import { useTween } from '@/components/site/pricing/motion';
import { formatCount, formatPrice, pricePerThousand, pricing, type Tier } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { ghostOf } from './motion';

/**
 * The plan ladder on the black display, as on /pricing: the screen reads the
 * step at `at` (emails, price, price per 1,000), the row under it picks one
 * (click or arrow keys). The plan held now carries a lit LED in the row and
 * "Your plan" on the screen; the step on screen gets the orange rule.
 */
export function PlanLadder({
  at,
  current,
  onPick,
  screenRef,
  live,
}: {
  at: number;
  current: number;
  onPick: (index: number) => void;
  screenRef?: Ref<HTMLDivElement>;
  /** Announce the step to screen readers (after the user picked, not while it climbs). */
  live: boolean;
}) {
  const tiers: Tier[] = pricing.tiers;
  const t = tiers[at] ?? pricing.free;
  const free = t.price === 0;
  const emails = useTween(t.emailsPerMonth);
  const price = useTween(t.price);
  const shownEmails = formatCount(Math.abs(emails - t.emailsPerMonth) < 0.5 ? t.emailsPerMonth : Math.round(emails));
  const shownPrice = free && price < 0.5 ? 'FREE' : formatPrice(Math.abs(price - t.price) < 0.01 ? t.price : Math.round(price));
  const widest = formatCount(pricing.top.emailsPerMonth);
  const lit = Math.round((at / Math.max(1, tiers.length - 1)) * METER_SEGMENTS);
  const mine = at === current;

  const keys = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (i: number): void => {
    const next = Math.min(tiers.length - 1, Math.max(0, i));
    onPick(next);
    keys.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') pick(at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') pick(at - 1);
    else if (e.key === 'Home') pick(0);
    else if (e.key === 'End') pick(tiers.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="w-full">
      <div ref={screenRef} className="screen screen-hero p-5 sm:p-8" aria-live={live ? 'polite' : 'off'}>
        <div className="flex items-center gap-3">
          <span className="led led-on" />
          <span className="cap text-screen-foreground/50">Verified emails a month</span>
          <span className={cn('cap ml-auto tabular-nums', mine ? 'text-primary' : 'text-screen-foreground/50')}>
            {mine ? 'Your plan' : `${String(at + 1).padStart(2, '0')} / ${String(tiers.length).padStart(2, '0')}`}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <Figure value={shownEmails} ghost={ghostOf(widest)} className="text-[40px] sm:text-[80px]" />
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="cap text-primary">{free ? 'Always' : 'A month'}</span>
            <span className="lcd text-[28px] leading-none sm:text-[40px]">{shownPrice}</span>
            <span className="cap text-screen-foreground/50 tabular-nums">{free ? 'No card' : `${pricePerThousand(t)} per 1,000`}</span>
          </div>
        </div>
        <ScreenMeter lit={lit} className="mt-8" />
      </div>

      <div role="radiogroup" aria-label="Plans" onKeyDown={onKeyDown} className="mt-8 grid grid-cols-4 gap-x-4 gap-y-6 sm:grid-cols-7">
        {tiers.map((tier, i) => (
          <button
            key={tier.plan}
            ref={(el) => {
              keys.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={i === at}
            aria-label={`${formatCount(tier.emailsPerMonth)} emails, ${tier.price === 0 ? 'free' : `${formatPrice(tier.price)} a month`}${i === current ? ', your plan' : ''}`}
            tabIndex={i === at ? 0 : -1}
            onClick={() => pick(i)}
            className="group relative border-t pt-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span
              aria-hidden
              className={cn(
                'absolute -top-px left-0 h-0.5 w-full origin-left bg-primary transition-transform duration-500 ease-out-soft motion-reduce:transition-none',
                i === at ? 'scale-x-100' : 'scale-x-0',
              )}
            />
            <span
              className={cn(
                'cap flex items-center gap-1.5 tabular-nums transition-colors',
                i === at ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            >
              {i === current && <span aria-hidden className="led led-on" />}
              {tier.price === 0 ? 'Free' : formatPrice(tier.price)}
            </span>
            <span
              className={cn('mt-1 block text-[15px] tabular-nums transition-colors sm:text-lg', i === at ? 'text-foreground' : 'text-muted-foreground')}
            >
              {formatCount(tier.emailsPerMonth)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

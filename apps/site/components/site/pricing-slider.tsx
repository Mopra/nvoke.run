'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Figure, METER_SEGMENTS, ScreenMeter } from '@/components/mockups/parts';
import { useInView } from '@/components/site/home/motion';
import { useRunTo, useTween } from '@/components/site/pricing/motion';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricePerThousand, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

const ghostOf = (s: string) => s.replace(/\d/g, '8');

/**
 * The plan ladder on the hero screen. When it first scrolls into view it
 * climbs from Free to `initial`, the figures counting over their ghost
 * digits. Then the row of steps under it picks (click or arrow keys), and
 * the keys under that start free or buy.
 */
export function PricingSlider({ initial = 'emails_2500' }: { initial?: string }) {
  const tiers = pricing.tiers;
  const start = Math.max(
    0,
    tiers.findIndex((t) => t.plan === initial),
  );
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -10% 0px', true);
  const [picked, setPicked] = useState<number | null>(null);
  const climbed = useRunTo(start, 320, inView && picked === null);
  const at = picked ?? climbed;
  const t = tiers[at] ?? pricing.free;
  const free = t.price === 0;

  const emails = useTween(t.emailsPerMonth);
  const price = useTween(t.price);
  const shownEmails = formatCount(Math.abs(emails - t.emailsPerMonth) < 0.5 ? t.emailsPerMonth : Math.round(emails));
  const shownPrice = free && price < 0.5 ? 'FREE' : formatPrice(Math.abs(price - t.price) < 0.01 ? t.price : Math.round(price));
  const widest = formatCount(pricing.top.emailsPerMonth);
  const lit = Math.round((at / Math.max(1, tiers.length - 1)) * METER_SEGMENTS);

  const keys = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (i: number) => {
    const next = Math.min(tiers.length - 1, Math.max(0, i));
    setPicked(next);
    keys.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') pick(at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') pick(at - 1);
    else if (e.key === 'Home') pick(0);
    else if (e.key === 'End') pick(tiers.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl">
      <div className="screen screen-hero p-6 sm:p-10" aria-live={picked === null ? 'off' : 'polite'}>
        <div className="flex items-center gap-3">
          <span className="led led-on" />
          <span className="cap text-screen-foreground/60">Verified emails a month</span>
          <span className="cap ml-auto text-screen-foreground/60 tabular-nums">
            {String(at + 1).padStart(2, '0')} / {String(tiers.length).padStart(2, '0')}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <Figure
            value={shownEmails.padStart(widest.length, ' ')}
            ghost={ghostOf(widest)}
            className="text-[44px] whitespace-pre sm:text-[96px]"
          />
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="cap text-primary">{free ? 'Always' : 'A month'}</span>
            <span className="lcd text-[32px] leading-none sm:text-[48px]">{shownPrice}</span>
            <span className="cap text-screen-foreground/60 tabular-nums">
              {free ? 'No card' : `${pricePerThousand(t)} per 1,000`}
            </span>
          </div>
        </div>
        <ScreenMeter lit={lit} className="mt-8 sm:mt-10" />
      </div>

      <div
        role="radiogroup"
        aria-label="Plans"
        onKeyDown={onKeyDown}
        className="mt-8 grid grid-cols-4 gap-x-4 gap-y-6 sm:grid-cols-7"
      >
        {tiers.map((tier, i) => (
          <button
            key={tier.plan}
            ref={(el) => {
              keys.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={i === at}
            tabIndex={i === at ? 0 : -1}
            onClick={() => pick(i)}
            className="group relative border-t pt-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute -top-px left-0 h-0.5 w-full origin-left bg-primary transition-transform duration-500 ease-out-soft',
                i === at ? 'scale-x-100' : 'scale-x-0',
              )}
            />
            <span className={cn('cap block tabular-nums transition-colors', i === at ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>
              {tier.price === 0 ? 'Free' : formatPrice(tier.price)}
            </span>
            <span className={cn('mt-1 block text-[15px] tabular-nums transition-colors sm:text-lg', i === at ? 'text-foreground' : 'text-muted-foreground')}>
              {formatCount(tier.emailsPerMonth)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-12 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-[15px] text-pretty text-muted-foreground">
          {pricing.vatNote} Need more than {formatCount(pricing.top.emailsPerMonth)}?{' '}
          <a href={`mailto:${site.email.hello}`} className="text-foreground underline underline-offset-4">
            Talk to us
          </a>
          .
        </p>
        <div className="flex flex-wrap gap-3">
          {free ? (
            <Button asChild size="lg" variant="dark">
              <Link href="/sign-up">Start free</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg" variant="secondary">
                <Link href="/sign-up">Start free</Link>
              </Button>
              {/* Checkout in the web app with Clerk Billing. Signed out, it signs in first and comes back. */}
              <Button asChild size="lg" variant="dark">
                <Link href="/app/billing">Buy {formatCount(t.emailsPerMonth)}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

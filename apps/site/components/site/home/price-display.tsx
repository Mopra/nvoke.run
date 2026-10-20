'use client';

import { useState } from 'react';
import { Figure } from '@/components/mockups/parts';
import { useInView, useTicker } from '@/components/site/home/motion';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const ghostOf = (s: string) => s.replace(/\d/g, '8');

/**
 * The ladder on a screen: the display reads one step, the row below lights
 * the same one. It walks up the ladder on its own until someone picks a step.
 */
export function PriceDisplay() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [picked, setPicked] = useState<number | null>(null);
  const tick = useTicker(1600, inView && picked === null, 1);
  const tiers = pricing.tiers;
  const at = picked ?? tick % tiers.length;
  const tier = tiers[at]!;
  const count = formatCount(tier.emailsPerMonth);
  const price = tier.price === 0 ? 'FREE' : formatPrice(tier.price);
  const widest = formatCount(pricing.top.emailsPerMonth);

  return (
    <div ref={ref} className="mt-16 sm:mt-24">
      <div className="screen screen-hero p-6 sm:p-10">
        <div className="flex items-center gap-3">
          <span className="led led-on" />
          <span className="cap text-screen-foreground/60">Verified emails a month</span>
          <span className="cap ml-auto text-screen-foreground/60 tabular-nums">
            {String(at + 1).padStart(2, '0')} / {String(tiers.length).padStart(2, '0')}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <Figure
            key={tier.plan}
            value={count.padStart(widest.length, ' ')}
            ghost={ghostOf(widest)}
            className="text-[44px] whitespace-pre sm:text-[96px]"
          />
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="cap text-primary">{tier.price === 0 ? 'Always' : 'A month'}</span>
            <span className="lcd text-[32px] leading-none sm:text-[48px]">{price}</span>
          </div>
        </div>
      </div>
      <div role="radiogroup" aria-label="Plans" className="mt-8 grid grid-cols-4 gap-x-4 gap-y-6 sm:grid-cols-7">
        {tiers.map((t, i) => (
          <button
            key={t.plan}
            type="button"
            role="radio"
            aria-checked={i === at}
            onClick={() => setPicked(i)}
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
              {t.price === 0 ? 'Free' : formatPrice(t.price)}
            </span>
            <span className={cn('mt-1 block text-[15px] tabular-nums transition-colors sm:text-lg', i === at ? 'text-foreground' : 'text-muted-foreground')}>
              {formatCount(t.emailsPerMonth)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

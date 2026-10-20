'use client';

import type { ReactNode } from 'react';
import { Figure } from '@/components/mockups/parts';
import { Knob } from '@/components/ui/knob';
import { formatCount, formatPrice, pricePerThousand, type Tier } from '@/lib/pricing';
import { cn } from '@/lib/utils';

/**
 * The plan ladder as an instrument: the knob turns through the steps, the
 * screen reads off the emails, the price and the price per 1,000 verified
 * emails. Click, drag, scroll or the arrow keys turn it; the step keys under
 * the screen jump straight to a step. The action under it is up to the
 * caller (sign up on the pricing page, a checkout on billing).
 */
export function PlanSlider({
  tiers,
  index,
  onIndexChange,
  badge,
  children,
  className,
}: {
  tiers: Tier[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Shown on the screen next to the price, for example "Current plan". */
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = tiers[index] ?? tiers[0]!;
  const steps = tiers.map((_, i) => i);
  const free = t.price === 0;
  const price = free ? 'FREE' : formatPrice(t.price);
  return (
    <div className={cn('panel mx-auto flex w-full max-w-3xl flex-col gap-8 p-5 sm:p-8', className)}>
      <div className="grid items-center gap-8 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <Knob
            value={index}
            options={steps}
            onChange={onIndexChange}
            label="Verified emails a month"
            format={(i) => shortLabel(tiers[i]).toUpperCase()}
            size={190}
          />
          <span className="cap text-muted-foreground">Emails a month</span>
        </div>

        <div className="screen flex min-w-0 flex-col gap-5 p-5 sm:p-6" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="led led-on" />
            <span className="cap text-screen-foreground/60">Plan</span>
            <span className="cap ml-auto flex items-center gap-2 text-screen-foreground/60">{badge}</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="cap text-screen-foreground/60">Verified emails</span>
            <Figure
              value={formatCount(t.emailsPerMonth)}
              ghost="888,888"
              className="self-start text-[34px] sm:text-[44px]"
            />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-screen-dim pt-5">
            <div className="flex flex-col gap-2">
              <span className="cap text-screen-foreground/60">A month</span>
              <Figure value={price} ghost="$888" className="self-start text-[34px] sm:text-[44px]" />
            </div>
            <span className="cap pb-1 text-screen-foreground/60">
              {free ? 'No card' : `${pricePerThousand(t)} per 1,000`}
            </span>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Plan steps" className="grid grid-cols-3 gap-2 min-[520px]:grid-cols-6">
        {tiers.map((tier, i) => (
          <button
            key={tier.plan}
            type="button"
            onClick={() => onIndexChange(i)}
            aria-pressed={i === index}
            className={cn(
              'key flex h-11 flex-col items-center justify-center gap-1 bg-secondary font-mono text-[11.5px] font-medium tracking-[0.07em] text-secondary-foreground uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              i === index && 'key-down',
            )}
          >
            <span className={cn('led', i === index && 'led-on')} />
            {shortLabel(tier)}
          </button>
        ))}
      </div>

      {children}
    </div>
  );
}

function shortLabel(tier: Tier | undefined): string {
  if (!tier) return '';
  if (tier.price === 0) return 'Free';
  const n = tier.emailsPerMonth;
  return n >= 1000 ? `${formatCount(n / 1000)}K` : formatCount(n);
}

'use client';

import type { ReactNode } from 'react';
import { formatCount, formatPrice, pricePerThousand, type Tier } from '@/lib/pricing';
import { cn } from '@/lib/utils';

/**
 * One slider over the plan ladder: the volume you pick, its price, and the
 * effective price per 1,000 verified emails. The action under it is up to the
 * caller (a download link on the pricing page, a checkout on billing).
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
  /** Shown next to the price, for example "Current plan". */
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = tiers[index] ?? tiers[0]!;
  const fill = tiers.length > 1 ? (index / (tiers.length - 1)) * 100 : 0;
  return (
    <div
      className={cn(
        'glass-strong mx-auto flex w-full max-w-2xl flex-col gap-10 rounded-[32px] p-7 text-card-foreground sm:p-12',
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">Verified emails a month</p>
          <p className="font-display text-5xl font-extralight tracking-[-0.045em] tabular-nums sm:text-7xl">
            {formatCount(t.emailsPerMonth)}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:items-end">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {badge}
            {t.price === 0 ? 'No card needed' : `${pricePerThousand(t)} per 1,000`}
          </p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-5xl font-extralight tracking-[-0.045em] tabular-nums sm:text-7xl">
              {t.price === 0 ? 'Free' : formatPrice(t.price)}
            </span>
            {t.price === 0 ? null : <span className="text-sm text-muted-foreground">per month</span>}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <input
          type="range"
          min={0}
          max={tiers.length - 1}
          step={1}
          value={index}
          onChange={(e) => onIndexChange(Number(e.target.value))}
          aria-label="Verified emails a month"
          aria-valuetext={`${formatCount(t.emailsPerMonth)} verified emails a month, ${t.price === 0 ? 'free' : `${formatPrice(t.price)} per month`}`}
          className="plan-range w-full cursor-pointer"
          style={{ ['--fill' as string]: `${fill}%` }}
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          {tiers.map((tier, i) => (
            <button
              key={tier.plan}
              type="button"
              onClick={() => onIndexChange(i)}
              className={cn(
                // The padding makes a finger sized target; the negative margin keeps the row's spacing.
                '-mx-1 -my-2.5 rounded-md px-2 py-3 transition-colors hover:text-foreground',
                i === index && 'font-medium text-foreground',
                // Narrow screens: keep the ends and the picked tier only.
                i !== 0 && i !== tiers.length - 1 && i !== index && 'hidden sm:inline',
              )}
            >
              {tier.price === 0 ? 'Free' : shortCount(tier.emailsPerMonth)}
            </button>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}

function shortCount(n: number): string {
  return n >= 1000 ? `${formatCount(n / 1000)}k` : formatCount(n);
}

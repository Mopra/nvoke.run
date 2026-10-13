import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { cn } from '@/lib/utils';

export function PricingCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
      {pricing.plans.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            'relative flex flex-col gap-7 rounded-2xl border bg-card p-7 text-card-foreground shadow-sm dark:bg-card/80',
            plan.highlighted && 'border-primary/40 shadow-[0_0_0_1px_var(--ring),0_24px_64px_-28px_var(--glow)]',
          )}
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-semibold tracking-[-0.02em]">{plan.name}</h3>
            <p className="text-sm text-pretty text-muted-foreground">{plan.summary}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-[-0.04em] tabular-nums">{formatPrice(plan.price)}</span>
              <span className="text-sm text-muted-foreground">per month</span>
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{formatCount(plan.emailsPerMonth)}</span>{' '}
              verified emails a month
            </p>
          </div>
          {compact ? null : (
            <ul className="flex flex-col gap-2.5 border-t pt-6 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <Check className="size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          )}
          <Button
            asChild
            size="lg"
            variant={plan.highlighted ? 'default' : 'secondary'}
            className="mt-auto w-full"
          >
            <Link href="/download">{plan.price === 0 ? 'Download and start free' : `Start with ${plan.name}`}</Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

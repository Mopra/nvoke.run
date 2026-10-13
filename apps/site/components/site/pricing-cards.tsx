import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { cn } from '@/lib/utils';

export function PricingCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {pricing.plans.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            'flex flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground',
            plan.highlighted && 'border-ring ring-1 ring-ring',
          )}
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="text-sm text-muted-foreground">{plan.summary}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatPrice(plan.price)}</span>
              <span className="text-sm text-muted-foreground">per month</span>
            </p>
            <p className="text-sm">
              <span className="font-medium tabular-nums">{formatCount(plan.emailsPerMonth)}</span> verified emails a
              month
            </p>
          </div>
          {compact ? null : (
            <ul className="flex flex-col gap-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-muted-foreground" />
                  {f}
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant={plan.highlighted ? 'default' : 'outline'} className="mt-auto">
            <Link href="/download">{plan.price === 0 ? 'Download and start free' : `Start with ${plan.name}`}</Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

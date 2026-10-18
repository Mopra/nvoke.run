'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlanSlider } from '@/components/site/plan-slider';
import { Button } from '@/components/ui/button';
import { pricing } from '@/lib/pricing';

/** The marketing ladder: turn to a volume, read the price, start free or buy, all in the browser. */
export function PricingSlider({ initial = 'emails_2500' }: { initial?: string }) {
  const start = Math.max(
    0,
    pricing.tiers.findIndex((t) => t.plan === initial),
  );
  const [index, setIndex] = useState(start);
  const t = pricing.tiers[index] ?? pricing.free;
  return (
    <PlanSlider tiers={pricing.tiers} index={index} onIndexChange={setIndex}>
      <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px] text-pretty text-muted-foreground">Every feature on every plan. Change or cancel whenever.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {t.price === 0 ? (
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
                <Link href="/app/billing">Buy now</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </PlanSlider>
  );
}

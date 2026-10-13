'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlanSlider } from '@/components/site/plan-slider';
import { Button } from '@/components/ui/button';
import { pricing } from '@/lib/pricing';

/** The marketing slider: pick a volume, see the price, download to start. */
export function PricingSlider({ initial = 'emails_2500' }: { initial?: string }) {
  const start = Math.max(
    0,
    pricing.tiers.findIndex((t) => t.plan === initial),
  );
  const [index, setIndex] = useState(start);
  const t = pricing.tiers[index] ?? pricing.free;
  return (
    <PlanSlider tiers={pricing.tiers} index={index} onIndexChange={setIndex}>
      <div className="flex flex-col items-center gap-3 border-t pt-7 sm:flex-row sm:justify-between">
        <p className="text-sm text-pretty text-muted-foreground">
          Every feature on every plan. Change or cancel whenever.
        </p>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/download">{t.price === 0 ? 'Download and start free' : 'Download nvoke'}</Link>
        </Button>
      </div>
    </PlanSlider>
  );
}

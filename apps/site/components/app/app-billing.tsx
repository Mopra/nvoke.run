'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BackLink } from '@/components/app/shell';
import { DesktopBilling } from '@/app/desktop/billing/desktop-billing';
import { BILLING_PATH } from '@/lib/app/quota';
import { keys } from '@/lib/app/queries';

/** The plans from /pricing with Clerk Billing checkout, inside the app. */
export function AppBilling() {
  const client = useQueryClient();
  const onPlanChange = useCallback(() => void client.invalidateQueries({ queryKey: keys.me }), [client]);
  return (
    <main className="w-full px-4 pb-24 sm:px-8">
      <div className="mx-auto max-w-2xl pt-8">
        <BackLink href="/app/account" label="Account" />
        <div className="mt-6 flex flex-col items-center motion-safe:animate-rise">
          <DesktopBilling
            returnUrl={BILLING_PATH}
            doneHint="Your new allowance applies at once, here and in nvoke Desktop."
            onPlanChange={onPlanChange}
          />
        </div>
      </div>
    </main>
  );
}

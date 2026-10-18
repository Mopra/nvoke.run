'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { APP_FRAME, APP_INSET, BackLink, DisplayTitle } from '@/components/app/shell';
import { DesktopBilling } from '@/app/desktop/billing/desktop-billing';
import { BILLING_PATH } from '@/lib/app/quota';
import { keys } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/** The plans from /pricing with Clerk Billing checkout, inside the app. */
export function AppBilling() {
  const client = useQueryClient();
  const onPlanChange = useCallback(() => void client.invalidateQueries({ queryKey: keys.me }), [client]);
  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'pt-8')}>
        <BackLink href="/app/account" label="Account" />
        <DisplayTitle className="pt-6">Your plan</DisplayTitle>
        <DesktopBilling
          returnUrl={BILLING_PATH}
          doneHint="Your new allowance applies at once, here and in nvoke Desktop."
          onPlanChange={onPlanChange}
          title={false}
        />
      </div>
    </main>
  );
}

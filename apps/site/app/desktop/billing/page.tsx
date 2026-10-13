import type { Metadata } from 'next';
import { LogoMark } from '@/components/site/logo';
import { DesktopBilling } from './desktop-billing';

export const metadata: Metadata = {
  title: 'Plan and billing',
  robots: { index: false, follow: false },
};

/**
 * Opened from "Manage billing" in the desktop app. The app never runs Clerk,
 * so checkout and cancelling happen here, in the browser, with Clerk Billing.
 */
export default function DesktopBillingPage() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="halo pointer-events-none absolute top-24 left-1/2 h-[30rem] w-[44rem] max-w-[140vw] -translate-x-1/2 opacity-30 dark:opacity-35"
      />
      <div className="relative mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center gap-8 px-4 py-16 sm:px-6 sm:py-24">
        <LogoMark className="size-14" />
        <DesktopBilling />
      </div>
    </section>
  );
}

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/app/providers';
import { AppShell } from '@/components/app/shell';
import { SiteClerkProvider } from '@/components/site/clerk';

export const metadata: Metadata = {
  title: { default: 'nvoke', template: '%s | nvoke' },
  robots: { index: false, follow: false },
};

/**
 * The web app: search, results, export, usage and API keys in the browser,
 * on the same Clerk account, plans and API as nvoke Desktop. proxy.ts sends
 * signed-out visitors to /sign-in first.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SiteClerkProvider>
      <AppProviders>
        <AppShell>{children}</AppShell>
      </AppProviders>
    </SiteClerkProvider>
  );
}

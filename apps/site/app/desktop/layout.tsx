import type { ReactNode } from 'react';
import { SiteClerkProvider } from '@/components/site/clerk';

// Clerk is scoped to /desktop so the rest of the site stays static.
export default function DesktopLayout({ children }: { children: ReactNode }) {
  return <SiteClerkProvider>{children}</SiteClerkProvider>;
}

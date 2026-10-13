import type { ReactNode } from 'react';
import { SiteClerkProvider } from '@/components/site/clerk';

export default function ClaimLayout({ children }: { children: ReactNode }) {
  return <SiteClerkProvider>{children}</SiteClerkProvider>;
}

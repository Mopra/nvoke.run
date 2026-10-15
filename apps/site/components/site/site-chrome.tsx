'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** The marketing header and footer stay off the web app, which has its own frame. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (path === '/app' || path?.startsWith('/app/')) return null;
  return <>{children}</>;
}

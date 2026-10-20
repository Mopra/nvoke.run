'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { APP_FRAME } from '@/components/app/shell';
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { useSendingAccess, useSendingSummary } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * The sending routes for internal accounts only (docs/sending/plan.md,
 * "Internal only"). The screen mounts once GET /v1/sending answered 200;
 * until then the loader shows, and a 404 shows the app's not found state,
 * so no sending UI ever flashes for anyone else.
 */
export function SendingGate({ children }: { children: ReactNode }) {
  const access = useSendingAccess();
  const { error, refetch } = useSendingSummary();
  if (access === 'internal') return <>{children}</>;
  if (access === 'checking') return <LoadingState />;
  return (
    <main className={cn(APP_FRAME, 'app-view')}>
      {access === 'hidden' ? (
        <EmptyState
          icon={SearchX}
          title="Nothing here"
          action={
            <Button asChild variant="outline">
              <Link href="/app">Back to searches</Link>
            </Button>
          }
        >
          The link is wrong, or the page is gone.
        </EmptyState>
      ) : (
        <ErrorState error={error} onRetry={() => void refetch()} />
      )}
    </main>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { apiUrl } from '@/lib/api';
import { ApiError, createWebApi } from '@/lib/app/api';
import { ApiProvider } from '@/lib/app/queries';

/**
 * Everything the web app's screens need: the API on the Clerk session, React
 * Query, tooltips and toasts. Mounted once by app/app/layout.tsx.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  // getToken is stable per Clerk instance and always returns a fresh token.
  const [api] = useState(() => createWebApi({ baseUrl: apiUrl, getToken: () => getToken() }));
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: true,
            // A 4xx will not change on a retry; a network blip might.
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
          },
        },
      }),
  );

  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          {children}
          <AppToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}

/** Toasts drop in at the top center as small plates with a hairline rim, labels printed, as in the desktop app. */
function AppToaster() {
  return (
    <Toaster
      position="top-center"
      offset={60}
      gap={8}
      icons={{
        success: <span className="led bg-chart-1" />,
        error: <span className="led bg-destructive" />,
        warning: <span className="led bg-chart-2" />,
        info: <span className="led" />,
        loading: <span className="led led-on motion-safe:animate-pulse" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'panel flex w-[min(380px,calc(100vw-32px))] items-start gap-3 rounded-[4px] px-4 py-3 text-[13px] text-card-foreground shadow-[var(--shadow-plate),inset_0_0_0_1px_var(--border)]',
          icon: 'mt-[5px] flex size-1.5 shrink-0 items-center justify-center',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'font-medium',
          description: 'font-mono text-[12px] tracking-[0.02em] text-muted-foreground',
          actionButton:
            'key ml-auto h-6 shrink-0 bg-foreground px-2.5 font-mono text-[11px] font-medium tracking-[0.07em] text-background uppercase outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring/50',
          cancelButton:
            'key ml-auto h-6 shrink-0 bg-secondary px-2.5 font-mono text-[11px] font-medium tracking-[0.07em] text-secondary-foreground uppercase outline-none hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50',
        },
      }}
    />
  );
}

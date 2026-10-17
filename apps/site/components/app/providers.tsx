'use client';

import { useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from 'lucide-react';
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

/** Toasts drop in at the top center as glass capsules, as in the desktop app. */
function AppToaster() {
  return (
    <Toaster
      position="top-center"
      offset={72}
      gap={8}
      icons={{
        success: <CircleCheck className="size-4 text-chart-1" />,
        error: <CircleAlert className="size-4 text-destructive" />,
        warning: <TriangleAlert className="size-4 text-chart-2" />,
        info: <Info className="size-4 text-muted-foreground" />,
        loading: <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'glass-strong flex w-[min(380px,calc(100vw-32px))] items-start gap-3 rounded-[22px] px-4 py-3.5 text-[13px] text-popover-foreground',
          icon: 'mt-px flex size-4 shrink-0 items-center justify-center',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton:
            'ml-auto h-6 shrink-0 rounded-full bg-primary px-2.5 text-xs font-medium text-primary-foreground outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring/50',
          cancelButton:
            'ml-auto h-6 shrink-0 rounded-full bg-muted px-2.5 text-xs font-medium outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50',
        },
      }}
    />
  );
}

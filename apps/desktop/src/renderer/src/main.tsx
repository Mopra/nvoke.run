import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ApiError } from './lib/api';
import { refreshAuth } from './lib/auth';
import { initChrome } from './lib/chrome';
import { isGrabOverlay, isQuickWindow } from './lib/desktop';
import { initTheme } from './lib/theme';
import { GrabOverlay } from './components/GrabOverlay';
import { QuickWindow } from './components/QuickWindow';
import { CrashBoundary } from './components/CrashScreen';
import './index.css';

// The quick window shares this bundle and shows through to the apps behind it.
const quick = isQuickWindow();
if (quick) document.documentElement.dataset['quick'] = '';
// The screen grab overlay paints a frozen frame of the screen, edge to edge.
const grab = isGrabOverlay();
if (grab) document.documentElement.dataset['grab'] = '';

void initChrome();
initTheme();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // A 401 means the session ended. Ask the transport for the real state,
    // which switches the app to the signed-out screen.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) refreshAuth();
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500 && error.status !== 0) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CrashBoundary>{grab ? <GrabOverlay /> : quick ? <QuickWindow /> : <App />}</CrashBoundary>
    </QueryClientProvider>
  </StrictMode>,
);

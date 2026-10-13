import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ApiError } from './lib/api';
import { refreshAuth } from './lib/auth';
import { initChrome } from './lib/chrome';
import { initTheme } from './lib/theme';
import './index.css';

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
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

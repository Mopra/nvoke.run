import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { App } from './App';
import { env } from './lib/env';
import { followSystemTheme } from './lib/theme';
import './index.css';

followSystemTheme();

const root = createRoot(document.getElementById('root')!);

// Without a publishable key the app still runs, with sign-in disabled, so the
// shell can be developed before Clerk is configured.
root.render(
  <StrictMode>
    {env.clerkPublishableKey ? (
      <ClerkProvider publishableKey={env.clerkPublishableKey}>
        <App authEnabled />
      </ClerkProvider>
    ) : (
      <App authEnabled={false} />
    )}
  </StrictMode>,
);

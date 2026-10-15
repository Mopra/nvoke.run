import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';

/**
 * Clerk for the pages that need it (the web app, sign in and sign up,
 * /desktop and /claim, see proxy.ts). The marketing pages stay static. The
 * Clerk UI takes its colors from the shared theme tokens.
 */
export function SiteClerkProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
      appearance={{
        variables: {
          colorPrimary: 'var(--primary)',
          colorPrimaryForeground: 'var(--primary-foreground)',
          colorBackground: 'var(--card)',
          colorForeground: 'var(--card-foreground)',
          colorMuted: 'var(--muted)',
          colorNeutral: 'var(--foreground)',
          colorMutedForeground: 'var(--muted-foreground)',
          colorInput: 'var(--background)',
          colorInputForeground: 'var(--foreground)',
          colorBorder: 'var(--border)',
          colorRing: 'var(--ring)',
          colorDanger: 'var(--destructive)',
          borderRadius: 'var(--radius)',
          fontFamily: 'var(--font-sans)',
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

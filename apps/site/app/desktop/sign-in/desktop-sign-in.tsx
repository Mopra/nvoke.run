'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SignIn, useAuth, useClerk, useUser } from '@clerk/nextjs';
import { DesktopAuthorizeResponse } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { apiUrl } from '@/lib/api';

type Phase =
  | { kind: 'confirm' }
  | { kind: 'working' }
  | { kind: 'done'; callbackUrl: string }
  | { kind: 'error'; message: string };

/** Where the desktop app listens. Registered by the app with the OS. */
function callbackUrl(code: string, state: string): string {
  const params = new URLSearchParams({ code, state });
  return `nvoke://auth/callback?${params.toString()}`;
}

export function DesktopSignIn({ state, codeChallenge }: { state: string; codeChallenge: string }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });
  // Someone who signs in on this page has already said "yes", so skip the
  // confirm step for them. An existing browser session gets one explicit click.
  const sawSignedOut = useRef(false);

  const returnUrl = `/desktop/sign-in?${new URLSearchParams({ state, code_challenge: codeChallenge }).toString()}`;

  const authorize = useCallback(async () => {
    setPhase({ kind: 'working' });
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const res = await fetch(`${apiUrl}/v1/desktop/authorize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, code_challenge: codeChallenge }),
      });
      if (!res.ok) throw new Error(`The server said no (${res.status}). Try again.`);
      const { code } = DesktopAuthorizeResponse.parse(await res.json());
      const url = callbackUrl(code, state);
      setPhase({ kind: 'done', callbackUrl: url });
      window.location.href = url;
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [getToken, state, codeChallenge]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      sawSignedOut.current = true;
      return;
    }
    if (sawSignedOut.current) {
      sawSignedOut.current = false;
      void authorize();
    }
  }, [isLoaded, isSignedIn, authorize]);

  if (!isLoaded) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (!isSignedIn) {
    return <SignIn routing="hash" withSignUp forceRedirectUrl={returnUrl} signUpForceRedirectUrl={returnUrl} />;
  }

  const who = user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? 'your account';

  if (phase.kind === 'done') {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>You are in. Back to nvoke.</CardTitle>
          <CardDescription>
            Signed in as {who}. App did not open? Use the button. Then close this tab.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <a href={phase.callbackUrl}>Open nvoke</a>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Sign in to the nvoke app</CardTitle>
        <CardDescription>Continue as {who}?</CardDescription>
      </CardHeader>
      {phase.kind === 'error' && (
        <CardContent>
          <p className="text-sm text-destructive">{phase.message}</p>
        </CardContent>
      )}
      <CardFooter className="flex flex-col gap-2">
        <Button className="w-full" disabled={phase.kind === 'working'} onClick={() => void authorize()}>
          {phase.kind === 'working' ? 'Opening nvoke...' : phase.kind === 'error' ? 'Try again' : 'Continue'}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={phase.kind === 'working'}
          onClick={() => void signOut({ redirectUrl: returnUrl })}
        >
          Use a different account
        </Button>
      </CardFooter>
    </Card>
  );
}

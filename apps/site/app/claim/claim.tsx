'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SignIn, useAuth, useClerk, useSignIn, useUser } from '@clerk/nextjs';
import { ClaimResponse, ClaimStatusResponse, type AccountOrigin } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { apiUrl } from '@/lib/api';

type Phase =
  | { kind: 'start' }
  | { kind: 'signing-in' }
  | { kind: 'no-ticket' }
  | { kind: 'ticket-failed' }
  | { kind: 'loading' }
  | { kind: 'load-failed'; error: string }
  | { kind: 'human' }
  | { kind: 'choose'; account: AccountOrigin; error?: string }
  | { kind: 'claiming'; account: AccountOrigin; keep: boolean }
  | { kind: 'done'; result: ClaimResponse; keep: boolean; alreadyClaimed: boolean };

/** What fetch throws on a dead network, in words. */
function failure(err: unknown): string {
  return err instanceof TypeError
    ? 'Couldn’t reach our server. Check your connection and try again.'
    : err instanceof Error
      ? err.message
      : String(err);
}

/** Reads the ticket from `#ticket=...` and drops it from the address bar at once. */
function takeTicket(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  const ticket = new URLSearchParams(hash).get('ticket');
  if (hash) window.history.replaceState(null, '', '/claim');
  return ticket;
}

/**
 * The link in the claim email lands here. It signs the owner in with the
 * Clerk ticket in the fragment, reads the account with GET /v1/agents/claim,
 * then POST /v1/agents/claim records the claim and keeps or revokes the
 * agent's key. Only these two routes are called from this page: any other
 * signed-in request would claim the account on its own and revoke the
 * agent's key before the owner chose.
 */
export function Claim() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { signIn } = useSignIn();
  const [phase, setPhase] = useState<Phase>({ kind: 'start' });
  const started = useRef(false);

  /** Reads who made the account and whether it is claimed. Claims nothing. */
  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Open the link from the email again.');
      const res = await fetch(`${apiUrl}/v1/agents/claim`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`The server said no (${res.status}). Try again.`);
      const { account } = ClaimStatusResponse.parse(await res.json());
      if (account.createdBy === 'human') setPhase({ kind: 'human' });
      else if (account.claimedAt) setPhase({ kind: 'done', result: { account, revokedKeys: 0 }, keep: true, alreadyClaimed: true });
      else setPhase({ kind: 'choose', account });
    } catch (err) {
      setPhase({ kind: 'load-failed', error: failure(err) });
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    const ticket = takeTicket();
    void (async () => {
      if (!ticket) {
        if (isSignedIn) void load();
        else setPhase({ kind: 'no-ticket' });
        return;
      }
      setPhase({ kind: 'signing-in' });
      // The ticket names its own user. Someone else signed in here would be in the way.
      if (isSignedIn) await signOut();
      const { error } = await signIn.ticket({ ticket });
      if (error || signIn.status !== 'complete') {
        setPhase({ kind: 'ticket-failed' });
        return;
      }
      await signIn.finalize();
      void load();
    })();
  }, [isLoaded, isSignedIn, signIn, signOut, load]);

  const claim = useCallback(
    async (account: AccountOrigin, keep: boolean) => {
      setPhase({ kind: 'claiming', account, keep });
      try {
        const token = await getToken();
        if (!token) throw new Error('Your session expired. Open the link from the email again.');
        const res = await fetch(`${apiUrl}/v1/agents/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ acceptTerms: true, keepAgentKeys: keep }),
        });
        if (!res.ok) throw new Error(`The server said no (${res.status}). Try again.`);
        const result = ClaimResponse.parse(await res.json());
        setPhase({ kind: 'done', result, keep, alreadyClaimed: false });
      } catch (err) {
        setPhase({ kind: 'choose', account, error: failure(err) });
      }
    },
    [getToken],
  );

  if (phase.kind === 'start' || phase.kind === 'signing-in' || !isLoaded) {
    return <p className="text-sm text-muted-foreground">Signing you in...</p>;
  }
  if (phase.kind === 'loading') return <p className="text-sm text-muted-foreground">Loading your account...</p>;

  if (phase.kind === 'load-failed') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-destructive">{phase.error}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (phase.kind === 'no-ticket' || phase.kind === 'ticket-failed') {
    // Signed in through the form below: carry on with that account.
    if (isSignedIn) {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-mono text-foreground">{who(user)}</span>.
          </p>
          <Button onClick={() => void load()}>Continue</Button>
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">
            {phase.kind === 'ticket-failed' ? 'This claim link no longer works' : 'Claim your nvoke account'}
          </h1>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            {phase.kind === 'ticket-failed'
              ? 'It expired or was already used. Sign in with the email the agent used and claim the account here.'
              : 'Open the link from the email we sent, or sign in with the email the agent used.'}
          </p>
        </div>
        <SignIn routing="hash" forceRedirectUrl="/claim" />
      </div>
    );
  }

  if (phase.kind === 'done') return <Done phase={phase} />;
  if (phase.kind === 'human') return <NothingToClaim who={who(user)} />;

  return <Choose who={who(user)} phase={phase} onClaim={(keep) => void claim(phase.account, keep)} />;
}

function NothingToClaim({ who }: { who: string }) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl tracking-[-0.025em]">Nothing to claim</CardTitle>
        <CardDescription className="text-pretty">
          <span className="font-mono text-foreground">{who}</span> was not signed up by an agent. The account is
          already yours.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="w-full sm:flex-1">
          <Link href="/download">Get the app</Link>
        </Button>
        <Button asChild variant="secondary" className="w-full sm:flex-1">
          <Link href="/docs">Read the docs</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function who(user: ReturnType<typeof useUser>['user']): string {
  return user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? 'your email';
}

function Choose({
  who,
  phase,
  onClaim,
}: {
  who: string;
  phase: Extract<Phase, { kind: 'choose' | 'claiming' }>;
  onClaim: (keep: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const busy = phase.kind === 'claiming';
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl tracking-[-0.025em]">Claim your nvoke account</CardTitle>
        <CardDescription className="text-pretty">
          {phase.account.agentName ? `An AI agent called “${phase.account.agentName}”` : 'An AI agent'} signed you up as{' '}
          <span className="font-mono text-foreground">{who}</span> and got an API key.
          It can run searches on the free plan. Decide what happens to that key.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Keep it</span>: the agent goes on working for you.
          </li>
          <li>
            <span className="font-medium text-foreground">Revoke it</span>: the key stops working now. Make a new one
            in the app whenever you want.
          </li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            I accept the{' '}
            <Link href="/terms" target="_blank" className="underline underline-offset-4">
              terms
            </Link>
            , for me and for what my agent does with nvoke.
          </span>
        </label>
        {phase.kind === 'choose' && phase.error ? <p className="text-sm text-destructive">{phase.error}</p> : null}
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:flex-1" disabled={!accepted || busy} onClick={() => onClaim(true)}>
          {busy && phase.keep ? 'Claiming...' : 'Keep the agent’s key'}
        </Button>
        <Button variant="secondary" className="w-full sm:flex-1" disabled={!accepted || busy} onClick={() => onClaim(false)}>
          {busy && !phase.keep ? 'Revoking...' : 'Revoke it'}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Done({ phase }: { phase: Extract<Phase, { kind: 'done' }> }) {
  const { result, keep, alreadyClaimed } = phase;
  const agent = result.account.agentName ? `“${result.account.agentName}”` : 'The agent';
  const what = alreadyClaimed
    ? 'This account was already yours. Nothing changed.'
    : keep
      ? `${agent} keeps its key and goes on working for you.`
      : result.revokedKeys > 0
        ? `${agent} lost its key. Make a new one in the app any time.`
        : 'The agent had no live key left.';
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl tracking-[-0.025em]">The account is yours</CardTitle>
        <CardDescription className="text-pretty">{what}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>Free plan: 50 verified emails a month. Upgrade when you need more.</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="w-full sm:flex-1">
          <Link href="/download">Get the app</Link>
        </Button>
        <Button asChild variant="secondary" className="w-full sm:flex-1">
          <Link href="/docs">Read the docs</Link>
        </Button>
      </CardFooter>
      <CardFooter>
        <Link href="/desktop/billing" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          See plans
        </Link>
      </CardFooter>
    </Card>
  );
}

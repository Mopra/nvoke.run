import { useState } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { AuthState } from '@/lib/types';

/**
 * Shown while signed out, and while the browser sign-in is `pending`: the main
 * process owns that state, so it survives a reload and ends when the
 * nvoke://auth/callback arrives or the user cancels.
 */
export function SignedOutScreen({ state }: { state: Exclude<AuthState, { status: 'signed-in' }> }) {
  // Covers the moment between the click and the main process saying `pending`.
  const [opening, setOpening] = useState(false);
  const waiting = state.status === 'pending' || opening;
  const error = state.status === 'signed-out' ? state.error : undefined;

  async function signIn(): Promise<void> {
    setOpening(true);
    try {
      await api.signIn();
    } catch (err) {
      toast.error('Could not open your browser', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setOpening(false);
    }
  }

  function cancel(): void {
    setOpening(false);
    void api.cancelSignIn();
  }

  return (
    <div className="canvas relative isolate flex h-full flex-col overflow-hidden">
      <div className="app-drag absolute inset-x-0 top-0 h-(--titlebar-height)" />
      {/* The aura: one soft field of the accent light behind the mark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[34%] left-1/2 -z-10 h-[620px] w-[820px] -translate-x-1/2 -translate-y-1/2"
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--aura),transparent)] motion-safe:animate-breathe" />
      </div>

      <div className="relative flex flex-1 items-center justify-center p-8">
        <div className="flex w-full max-w-[460px] flex-col items-center text-center motion-safe:animate-rise">
          <LogoMark className="size-[72px]" />

          {waiting ? (
            <>
              <h1 className="mt-10 font-display text-4xl font-semibold">Finish in your browser</h1>
              <div className="mt-10 flex h-11 items-center gap-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 motion-safe:animate-spin" />
                Waiting for the browser
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="glass" onClick={() => void signIn()}>
                  Open the page again
                </Button>
                <Button variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-10 font-display text-4xl font-semibold text-balance">Research companies and their public contact details.</h1>
              <Button size="lg" className="mt-12 px-8" onClick={() => void signIn()}>
                Sign in with your browser
                <ArrowUpRight className="size-4 opacity-75" />
              </Button>
              {error ? (
                <p role="alert" className="mt-4 text-xs text-destructive">
                  {error}
                </p>
              ) : (
                <p className="mt-5 text-xs text-muted-foreground">Your password never touches this app.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

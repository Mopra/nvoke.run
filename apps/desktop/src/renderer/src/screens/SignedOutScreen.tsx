import { useState } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LogoMark, Wordmark } from '@/components/Logo';
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
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div className="app-drag absolute inset-x-0 top-0 h-(--titlebar-height)" />
      {/* A single soft halo of the accent behind the mark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[42%] left-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-30 dark:opacity-40"
      />

      <div className="relative flex flex-1 items-center justify-center p-8">
        <div className="flex w-full max-w-[340px] flex-col items-center text-center motion-safe:animate-page-in">
          <LogoMark className="size-16" />
          <Wordmark className="mt-5 text-2xl" />

          {waiting ? (
            <>
              <p className="mt-2 text-base text-muted-foreground">Finish signing in in your browser.</p>
              <div className="mt-8 flex h-10 items-center gap-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 motion-safe:animate-spin" />
                Waiting for the browser
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void signIn()}>
                  Open the page again
                </Button>
                <Button variant="ghost" size="sm" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-base text-muted-foreground">Find companies and the emails that reach them.</p>
              <Button size="lg" className="mt-8 w-full" onClick={() => void signIn()}>
                Sign in with your browser
                <ArrowUpRight className="size-4 opacity-75" />
              </Button>
              {error ? (
                <p role="alert" className="mt-4 text-xs text-destructive">
                  {error}
                </p>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">Your password never touches this app.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

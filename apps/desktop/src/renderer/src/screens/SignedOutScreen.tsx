import { useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Keyboard, Loader2, MailCheck, Search, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { AuthState } from '@/lib/types';
import { isFirstRun } from '@/lib/welcome';

/** What the first launch says nvoke does, one line each. */
const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: Search, text: 'Search by niche and place, or describe your customer.' },
  { icon: MailCheck, text: 'Every email checked with its mail server.' },
  { icon: Keyboard, text: 'Lives in your tray. A shortcut opens it over any app.' },
];

/** Staggers the first launch: each piece rises a beat after the last. */
const beat = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/**
 * Shown while signed out, and while the browser sign-in is `pending`: the main
 * process owns that state, so it survives a reload and ends when the
 * nvoke://auth/callback arrives or the user cancels.
 */
export function SignedOutScreen({ state }: { state: Exclude<AuthState, { status: 'signed-in' }> }) {
  // Covers the moment between the click and the main process saying `pending`.
  const [opening, setOpening] = useState(false);
  // Read once, so the welcome does not swap out from under a pending sign-in.
  const [welcome] = useState(() => isFirstRun());
  const waiting = state.status === 'pending' || opening;
  const error = state.status === 'signed-out' ? state.error : undefined;

  async function signIn(): Promise<void> {
    setOpening(true);
    try {
      await api.signIn();
    } catch (err) {
      toast.error('Couldn’t open your browser', { description: err instanceof Error ? err.message : undefined });
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
        <div className={welcome ? 'absolute inset-0 motion-safe:animate-bloom' : 'absolute inset-0'}>
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--aura),transparent)] motion-safe:animate-breathe" />
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center p-8">
        <div
          className={
            welcome
              ? 'flex w-full max-w-[460px] flex-col items-center text-center'
              : 'flex w-full max-w-[460px] flex-col items-center text-center motion-safe:animate-rise'
          }
        >
          <LogoMark className={welcome ? 'size-[88px] motion-safe:animate-arrive' : 'size-[72px]'} />

          {waiting ? (
            <>
              <h1 className="mt-10 font-display text-4xl font-semibold">Finish in your browser</h1>
              <div className="mt-10 flex h-11 items-center gap-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 motion-safe:animate-spin" />
                Waiting on your browser
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="glass" onClick={() => void signIn()}>
                  Reopen the page
                </Button>
                <Button variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </>
          ) : welcome ? (
            <>
              <h1 className="mt-10 font-display text-5xl font-semibold motion-safe:animate-rise" style={beat(250)}>
                Welcome to nvoke
              </h1>
              <p className="mt-4 text-lg text-balance text-muted-foreground motion-safe:animate-rise" style={beat(400)}>
                Find companies. Get emails that actually work.
              </p>
              <ul className="mt-12 flex flex-col gap-3.5 text-left text-sm text-muted-foreground">
                {POINTS.map(({ icon: Icon, text }, i) => (
                  <li key={text} className="flex items-center gap-3.5 motion-safe:animate-rise" style={beat(600 + i * 110)}>
                    <Icon className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
                    {text}
                  </li>
                ))}
              </ul>
              <Button size="lg" className="mt-12 px-8 motion-safe:animate-rise" style={beat(1000)} onClick={() => void signIn()}>
                Get started
                <ArrowRight className="size-4 opacity-75" />
              </Button>
              {error ? (
                <p role="alert" className="mt-4 text-xs text-destructive">
                  {error}
                </p>
              ) : (
                <p className="mt-5 text-xs text-muted-foreground motion-safe:animate-rise" style={beat(1100)}>
                  You sign in with your browser. Your password never touches this app.
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="mt-10 font-display text-4xl font-semibold text-balance">Find companies. Get emails that actually work.</h1>
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

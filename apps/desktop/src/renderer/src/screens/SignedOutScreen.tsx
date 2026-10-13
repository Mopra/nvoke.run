import { useState } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LogoMark, Wordmark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export function SignedOutScreen() {
  const [waiting, setWaiting] = useState(false);

  async function signIn(): Promise<void> {
    setWaiting(true);
    try {
      await api.signIn();
    } catch (err) {
      setWaiting(false);
      toast.error('Could not open your browser', { description: err instanceof Error ? err.message : undefined });
    }
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
                <Button variant="ghost" size="sm" onClick={() => setWaiting(false)}>
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
              <p className="mt-4 text-xs text-muted-foreground">Your password never touches this app.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

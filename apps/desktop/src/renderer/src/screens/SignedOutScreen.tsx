import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <div className="mb-8 text-3xl font-semibold tracking-tight">nvoke</div>
          <div className="w-full rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
            {waiting ? (
              <>
                <Loader2 className="mx-auto mb-3 size-5 text-muted-foreground motion-safe:animate-spin" />
                <h1 className="text-base font-semibold">Finish signing in in your browser</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  nvoke opened a sign-in page. When you are done there, this window continues on its own.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void signIn()}>
                    <ExternalLink />
                    Open the page again
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setWaiting(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-base font-semibold">Sign in to find leads</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Sign in happens in your browser, so your password never touches this app.
                </p>
                <Button className="mt-5 w-full" onClick={() => void signIn()} autoFocus>
                  <ExternalLink />
                  Sign in with your browser
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

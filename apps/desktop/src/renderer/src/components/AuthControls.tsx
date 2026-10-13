import { LogOut } from 'lucide-react';
import { useAuthState } from '@/lib/auth';
import { Button } from '@/components/ui/button';

function initials(text: string): string {
  return text
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Header controls: sign in through the browser, or the signed-in user and sign out. */
export function AuthControls() {
  const state = useAuthState();

  if (!state) return null;

  if (state.status === 'pending') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Finish signing in in your browser</span>
        <Button size="sm" variant="ghost" onClick={() => void window.nvoke.auth.signIn()}>
          Reopen
        </Button>
        <Button size="sm" variant="outline" onClick={() => void window.nvoke.auth.cancelSignIn()}>
          Cancel
        </Button>
      </div>
    );
  }

  if (state.status === 'signed-out') {
    return (
      <div className="flex items-center gap-3">
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        <Button size="sm" onClick={() => void window.nvoke.auth.signIn()}>
          Sign in
        </Button>
      </div>
    );
  }

  const label = state.user?.name ?? state.user?.email ?? 'Signed in';
  return (
    <div className="flex items-center gap-3">
      {state.user?.imageUrl ? (
        <img src={state.user.imageUrl} alt="" className="size-7 rounded-full border" />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {initials(label)}
        </span>
      )}
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-medium">{label}</span>
        {state.user?.name && state.user.email && (
          <span className="text-xs text-muted-foreground">{state.user.email}</span>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={() => void window.nvoke.auth.signOut()}>
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}

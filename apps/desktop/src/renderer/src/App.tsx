import { Show, SignInButton, UserButton } from '@clerk/react';
import { AppShell } from '@/components/AppShell';
import { StatusCards } from '@/components/StatusCards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function ClerkControls() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button size="sm">Sign in</Button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}

export function App({ authEnabled }: { authEnabled: boolean }) {
  const header = authEnabled ? <ClerkControls /> : <Badge variant="outline">Sign-in disabled</Badge>;

  return (
    <AppShell header={header}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">Nothing collected yet.</p>
        </div>
        <StatusCards />
      </div>
    </AppShell>
  );
}

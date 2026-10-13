import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/lib/auth';
import { useModHotkey } from '@/lib/hotkeys';
import { navigate, useRoute, type Route } from '@/lib/router';
import { AccountScreen } from '@/screens/AccountScreen';
import { NewSearchScreen } from '@/screens/NewSearchScreen';
import { SearchesScreen } from '@/screens/SearchesScreen';
import { SearchResultsScreen } from '@/screens/SearchResultsScreen';
import { SignedOutScreen } from '@/screens/SignedOutScreen';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'searches':
      return <SearchesScreen />;
    case 'new':
      return <NewSearchScreen key={route.kind ?? 'default'} initialKind={route.kind} />;
    case 'search':
      return <SearchResultsScreen key={route.id} id={route.id} />;
    case 'account':
      return <AccountScreen />;
  }
}

function SignedIn() {
  const route = useRoute();
  useModHotkey('n', () => navigate({ name: 'new', kind: null }));
  useModHotkey(',', () => navigate({ name: 'account' }));
  return (
    <AppShell route={route}>
      <Screen route={route} />
    </AppShell>
  );
}

export function App() {
  const auth = useAuth();
  const client = useQueryClient();

  // Never show one account's data to the next person who signs in.
  useEffect(() => {
    if (auth?.status === 'signed-out') client.clear();
  }, [auth?.status, client]);

  return (
    <TooltipProvider>
      {auth === undefined ? (
        <div className="app-drag flex h-full items-center justify-center bg-background">
          <Loader2 className="size-5 text-muted-foreground motion-safe:animate-spin" />
        </div>
      ) : auth.status === 'signed-in' ? (
        <SignedIn />
      ) : (
        <SignedOutScreen />
      )}
      <Toaster />
    </TooltipProvider>
  );
}

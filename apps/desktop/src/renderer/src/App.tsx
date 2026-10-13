import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/lib/auth';
import { useDesktopCommands } from '@/lib/desktop';
import { useModHotkey } from '@/lib/hotkeys';
import { navigate, useRoute, type Route } from '@/lib/router';
import { AccountScreen } from '@/screens/AccountScreen';
import { DropEditorScreen } from '@/screens/DropEditorScreen';
import { DropsScreen } from '@/screens/DropsScreen';
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
    case 'drops':
      return <DropsScreen />;
    case 'drop':
      return <DropEditorScreen key={route.id ?? 'new'} id={route.id} keyword={route.keyword} />;
  }
}

function SignedIn() {
  const route = useRoute();
  useModHotkey('n', () => navigate({ name: 'new', kind: null }));
  useModHotkey(',', () => navigate({ name: 'account' }));
  useDesktopCommands((command) => {
    if (command.name === 'new-search') navigate({ name: 'new', kind: null });
    else if (command.name === 'search') navigate({ name: 'search', id: command.id });
    else if (command.name === 'route') window.location.hash = command.hash;
    else navigate({ name: 'searches' });
  });
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
        <SignedOutScreen state={auth} />
      )}
      <Toaster />
    </TooltipProvider>
  );
}

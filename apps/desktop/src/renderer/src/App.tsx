import { AppShell } from '@/components/AppShell';
import { AuthControls } from '@/components/AuthControls';
import { StatusCards } from '@/components/StatusCards';

export function App() {
  return (
    <AppShell header={<AuthControls />}>
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

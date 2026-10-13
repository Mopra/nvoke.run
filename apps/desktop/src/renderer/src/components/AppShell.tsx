import type { ReactNode } from 'react';
import { Inbox, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { label: 'Leads', icon: Inbox, active: true },
  { label: 'Settings', icon: Settings, active: false },
];

export function AppShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-4 text-lg font-semibold tracking-tight">nvoke</div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b px-6">{header}</header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

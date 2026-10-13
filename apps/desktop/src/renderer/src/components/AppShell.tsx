import type { ReactNode } from 'react';
import { CircleUser, List, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transportMode } from '@/lib/api';
import { formatNumber, percent, searchTitle } from '@/lib/format';
import { modKey } from '@/lib/hotkeys';
import { useMe, useSearches } from '@/lib/queries';
import { navigate, routeHref, type Route } from '@/lib/router';
import { StatusDot } from '@/components/indicators';
import { Kbd } from '@/components/ui/kbd';

function NavLink({
  href,
  active,
  icon: Icon,
  children,
  trailing,
}: {
  href: string;
  active: boolean;
  icon: typeof List;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        active
          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </a>
  );
}

function RecentSearches({ route }: { route: Route }) {
  const { data } = useSearches();
  const recent = data?.slice(0, 8) ?? [];
  if (recent.length === 0) return null;
  return (
    <div className="mt-5 flex min-h-0 flex-col">
      <div className="px-2.5 pb-1.5 text-xs font-medium text-sidebar-foreground/50">Recent</div>
      <div className="flex min-h-0 flex-col gap-px overflow-y-auto">
        {recent.map((s) => {
          const active = route.name === 'search' && route.id === s.id;
          return (
            <a
              key={s.id}
              href={routeHref({ name: 'search', id: s.id })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-7 items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )}
            >
              <StatusDot status={s.status} className="mx-1" />
              <span className="truncate">{searchTitle(s)}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function UsageFooter() {
  const { data } = useMe();
  if (!data) return <div className="h-14" />;
  const used = percent(data.usage.emailsFound, data.usage.limit);
  return (
    <a
      href={routeHref({ name: 'account' })}
      className="group flex flex-col gap-2 rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-sidebar-foreground/60">Emails this month</span>
        <span className="tabular-nums text-sidebar-foreground/80">
          {formatNumber(data.usage.emailsFound)} / {formatNumber(data.usage.limit)}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-sidebar-accent">
        <div
          className={cn('h-full rounded-full', used >= 90 ? 'bg-destructive' : 'bg-sidebar-ring')}
          style={{ width: `${used}%` }}
        />
      </div>
    </a>
  );
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { data } = useSearches();
  const running = data?.filter((s) => s.status === 'running' || s.status === 'queued').length ?? 0;

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2.5 pb-2.5 text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 px-2.5">
          <span className="text-[17px] font-semibold tracking-tight">nvoke</span>
          {transportMode === 'mock' && (
            <span className="rounded border border-sidebar-border px-1.5 py-px text-[10px] font-medium text-sidebar-foreground/60">
              Demo data
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate({ name: 'new', kind: null })}
          className={cn(
            'mb-4 flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2.5 text-sm font-medium text-sidebar-foreground shadow-xs outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          )}
        >
          <Plus className="size-4" />
          <span className="flex-1 text-left">New search</span>
          <Kbd className="border-sidebar-border bg-sidebar text-sidebar-foreground/60">
            {modKey} N
          </Kbd>
        </button>

        <nav className="flex flex-col gap-px">
          <NavLink
            href={routeHref({ name: 'searches' })}
            active={route.name === 'searches'}
            icon={List}
            trailing={
              running > 0 ? (
                <span className="rounded-full bg-sidebar-accent px-1.5 text-[11px] tabular-nums text-sidebar-foreground/70">
                  {running} running
                </span>
              ) : null
            }
          >
            Searches
          </NavLink>
          <NavLink href={routeHref({ name: 'account' })} active={route.name === 'account'} icon={CircleUser}>
            Account
          </NavLink>
        </nav>

        <RecentSearches route={route} />

        <div className="mt-auto pt-3">
          <UsageFooter />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** The bar at the top of every screen: title on the left, actions on the right. */
export function PageHeader({
  title,
  subtitle,
  leading,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-3 border-b px-6 py-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

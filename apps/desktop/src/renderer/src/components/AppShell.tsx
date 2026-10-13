import { useState, type ReactNode } from 'react';
import { Plus, Rows3, Search as SearchIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transportMode } from '@/lib/api';
import { formatNumber, percent, PLAN_LABEL, searchTitle } from '@/lib/format';
import { modKey, useModHotkey } from '@/lib/hotkeys';
import { useMe, useSearches } from '@/lib/queries';
import { routeHref, type Route } from '@/lib/router';
import { Avatar } from '@/components/Avatar';
import { CommandBar } from '@/components/CommandBar';
import { StatusDot } from '@/components/indicators';
import { LogoMark, Wordmark } from '@/components/Logo';
import { Kbd } from '@/components/ui/kbd';

const itemBase =
  'flex items-center gap-2.5 rounded-[7px] px-2 text-sm outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring/60';
const itemIdle = 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground';
const itemActive = 'bg-sidebar-accent font-medium text-sidebar-accent-foreground';

function NavLink({
  href,
  active,
  icon: Icon,
  children,
  trailing,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <a href={href} aria-current={active ? 'page' : undefined} className={cn(itemBase, 'h-7', active ? itemActive : itemIdle)}>
      {/* Selected rows tint their icon with the accent, as a source list does. */}
      <Icon
        className={cn(
          'size-4 shrink-0',
          active ? 'text-sidebar-primary blurred:text-sidebar-foreground/60' : 'text-sidebar-foreground/55',
        )}
      />
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
      <div className="px-2 pb-1 text-xs font-semibold text-sidebar-foreground/45">Recent</div>
      <div className="-mx-1 flex min-h-0 flex-col gap-px overflow-y-auto px-1">
        {recent.map((s) => {
          const active = route.name === 'search' && route.id === s.id;
          return (
            <a
              key={s.id}
              href={routeHref({ name: 'search', id: s.id })}
              data-search-status={s.status}
              aria-current={active ? 'page' : undefined}
              className={cn(itemBase, 'h-7 shrink-0', active ? itemActive : itemIdle)}
            >
              <span className="flex w-4 justify-center">
                <StatusDot status={s.status} />
              </span>
              <span className="truncate">{searchTitle(s)}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function Footer({ route }: { route: Route }) {
  const { data } = useMe();
  if (!data) return <div className="h-[86px]" />;
  const used = percent(data.usage.emailsFound, data.usage.limit);
  const active = route.name === 'account';
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1.5 px-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-sidebar-foreground/55">Emails this month</span>
          <span className="tabular-nums text-sidebar-foreground/75">
            {formatNumber(data.usage.emailsFound)} of {formatNumber(data.usage.limit)}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-sidebar-foreground/10">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-out-soft',
              used >= 90 ? 'bg-destructive' : 'bg-sidebar-foreground/45',
            )}
            style={{ width: `${used}%` }}
          />
        </div>
      </div>
      <a
        href={routeHref({ name: 'account' })}
        aria-current={active ? 'page' : undefined}
        className={cn(itemBase, 'h-11 gap-2.5 px-1.5', active ? itemActive : itemIdle, 'font-normal')}
      >
        <Avatar user={data.user} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">{data.user.name ?? data.user.email}</span>
          <span className="block truncate text-xs text-sidebar-foreground/55">{PLAN_LABEL[data.plan]} plan</span>
        </span>
      </a>
    </div>
  );
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { data } = useSearches();
  const running = data?.filter((s) => s.status === 'running' || s.status === 'queued').length ?? 0;
  const [commandOpen, setCommandOpen] = useState(false);
  useModHotkey('k', () => setCommandOpen((open) => !open));

  return (
    <div className="flex h-full">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2.5 pb-2.5 text-sidebar-foreground material:bg-sidebar-material">
        {/* The title strip. On macOS the traffic lights sit at its left. */}
        <div className="app-drag flex h-(--titlebar-height) shrink-0 items-center gap-2 px-2 mac:pl-[78px] mac:fullscreen:pl-2">
          <LogoMark className="size-[18px]" />
          <Wordmark className="text-[15px]" />
          {transportMode === 'mock' && (
            <span className="ml-auto rounded-full bg-sidebar-accent px-1.5 py-px text-2xs font-medium text-sidebar-foreground/60">
              Demo
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="mb-3 flex h-7 shrink-0 items-center gap-2 rounded-[8px] bg-sidebar-accent/70 px-2 text-sm text-sidebar-foreground/50 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
        >
          <SearchIcon className="size-3.5" />
          <span className="flex-1 text-left">Search</span>
          <Kbd className="bg-transparent text-sidebar-foreground/40">{modKey} K</Kbd>
        </button>

        <nav className="flex flex-col gap-px">
          <NavLink
            href={routeHref({ name: 'searches' })}
            active={route.name === 'searches'}
            icon={Rows3}
            trailing={
              running > 0 ? (
                <span className="text-xs tabular-nums text-sidebar-foreground/50">{running}</span>
              ) : null
            }
          >
            Searches
          </NavLink>
          <NavLink href={routeHref({ name: 'new', kind: null })} active={route.name === 'new'} icon={Plus}>
            New search
          </NavLink>
        </nav>

        <RecentSearches route={route} />

        <div className="mt-auto pt-3">
          <Footer route={route} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">{children}</div>
      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}

/**
 * The toolbar at the top of every screen, and the window's drag handle.
 * Title on the left, actions on the right, room for the caption buttons on
 * Windows and Linux. The hairline below appears once the page scrolls.
 */
export function PageHeader({
  title,
  subtitle,
  leading,
  actions,
  divider = false,
  titleHidden = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  divider?: boolean;
  /** For pages with a large title: the toolbar title appears once it scrolls away. */
  titleHidden?: boolean;
}) {
  return (
    <header
      className={cn(
        'app-drag relative z-20 flex h-(--titlebar-height) shrink-0 items-center gap-2 pr-titlebar pl-5 transition-shadow duration-200',
        divider && 'shadow-[0_1px_0_var(--border)]',
      )}
    >
      {leading}
      <div
        aria-hidden={titleHidden || undefined}
        className={cn(
          'min-w-0 flex-1 transition-[opacity,transform] duration-200 ease-out-soft',
          titleHidden && 'translate-y-1 opacity-0',
        )}
      >
        <h1 className="truncate text-[15px] leading-5 font-semibold tracking-[-0.01em]">{title}</h1>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** The page's large title, macOS style. Pair with `titleHidden` on PageHeader. */
export function LargeTitle({
  children,
  subtitle,
  className,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('pt-1 pb-5', className)}>
      <h1 className="text-2xl font-bold">{children}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

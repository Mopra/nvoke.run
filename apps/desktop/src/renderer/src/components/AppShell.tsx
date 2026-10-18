import { useState, type ReactNode } from 'react';
import { ChevronLeft, Plus, Search as SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transportMode } from '@/lib/api';
import { formatNumber, isActive, percent, searchTitle } from '@/lib/format';
import { modKey, useModHotkey } from '@/lib/hotkeys';
import { CountUp } from '@/lib/motion';
import { useMe, useSearches } from '@/lib/queries';
import { navigate, routeHref, type Route } from '@/lib/router';
import type { Search } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { CommandBar } from '@/components/CommandBar';
import { FileDrop } from '@/components/FileDrop';
import { LogoMark } from '@/components/Logo';
import { UpdateButton } from '@/components/UpdateButton';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The window is one calm canvas. No sidebar: a floating glass island at the
 * top center is the way around (it opens the command bar) and, while a search
 * runs, its live activity. The aura behind it rises only while nvoke works.
 */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { data } = useSearches();
  const live = data?.filter((s) => isActive(s.status)) ?? [];
  const [commandOpen, setCommandOpen] = useState(false);
  useModHotkey('k', () => setCommandOpen((open) => !open));

  return (
    <div className="canvas relative isolate flex h-full flex-col overflow-hidden">
      <Aura on={live.length > 0} />
      {children}
      <Island live={live} route={route} onOpen={() => setCommandOpen(true)} />
      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
      <FileDrop />
    </div>
  );
}

/** Ambient iris light at the top of the canvas. Present only while nvoke works: a search runs or a site is read. */
export function Aura({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute -top-[340px] left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 transition-opacity duration-[1600ms] ease-out-soft',
        on ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--aura),transparent)] motion-safe:animate-breathe" />
      <div className="absolute inset-x-[20%] top-[30%] bottom-0 rounded-full bg-[radial-gradient(closest-side,var(--aura-soft),transparent)]" />
    </div>
  );
}

/**
 * The island. At rest it is the way to search and jump; while a search runs
 * it carries that search's progress, like a live activity.
 */
function Island({ live, route, onOpen }: { live: Search[]; route: Route; onOpen: () => void }) {
  const current = live[0];
  // On the running search's own page, the page already shows the progress.
  const showLive = current && !(route.name === 'search' && route.id === current.id);
  const scale = current ? Math.max(current.limit, current.companiesFound, 1) : 1;
  const done = current ? percent(current.companiesCrawled, scale) : 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-(--titlebar-height) items-center justify-center">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Search or jump to"
        className={cn(
          'glass app-no-drag pointer-events-auto flex h-9 items-center gap-2.5 rounded-full pr-2 pl-3.5 text-sm outline-none',
          'transition-[width,background-color,transform] duration-500 ease-spring hover:bg-glass-strong active:scale-[0.98]',
          'focus-visible:ring-[3px] focus-visible:ring-ring/40',
        )}
      >
        {showLive ? (
          <>
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inset-0 rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-primary" />
            </span>
            <span className="max-w-40 truncate font-medium" title={searchTitle(current)}>
              {searchTitle(current)}
            </span>
            {/* The stage note is the progress, in words; narrow windows keep the bar instead. */}
            {current.stageNote && (
              <span data-island-stage className="hidden max-w-52 truncate text-xs text-muted-foreground min-[1100px]:inline" title={current.stageNote}>
                {current.stageNote}
              </span>
            )}
            <span
              className={cn(
                'h-[3px] w-12 shrink-0 overflow-hidden rounded-full bg-foreground/10',
                current.stageNote && 'min-[1100px]:hidden',
              )}
            >
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-700 ease-out-soft"
                style={{ width: `${Math.max(done, 4)}%` }}
              />
            </span>
            <span className="shrink-0 pr-1.5 text-xs tabular-nums text-muted-foreground">
              <span className="text-foreground">
                <CountUp value={current.emailsValid} />
              </span>{' '}
              verified
              {live.length > 1 && `, ${live.length - 1} more`}
            </span>
          </>
        ) : (
          <>
            <SearchIcon className="size-[15px] shrink-0 text-muted-foreground" />
            <span className="w-44 text-left text-muted-foreground">Search or jump to</span>
            <Kbd className="bg-transparent">{modKey} K</Kbd>
          </>
        )}
      </button>
    </div>
  );
}

/** The ring around the avatar: verified emails used this month. */
function UsageRing({ used, children }: { used: number; children: ReactNode }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-[38px] items-center justify-center">
      <svg viewBox="0 0 38 38" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="19" cy="19" r={r} fill="none" strokeWidth="1.5" className="stroke-foreground/10" />
        <circle
          cx="19"
          cy="19"
          r={r}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(used, 100) / 100)}
          className={cn('transition-[stroke-dashoffset] duration-1000 ease-out-soft', used >= 90 ? 'stroke-destructive' : 'stroke-primary')}
        />
      </svg>
      {children}
    </span>
  );
}

function AccountButton() {
  const { data } = useMe();
  if (!data) return <span className="size-[38px]" />;
  const used = percent(data.usage.emailsVerified, data.usage.emailsLimit);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={routeHref({ name: 'account' })}
          aria-label="Account"
          className="rounded-full outline-none transition-transform duration-200 active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <UsageRing used={used}>
            <Avatar user={data.user} className="size-7" />
          </UsageRing>
        </a>
      </TooltipTrigger>
      <TooltipContent>
        {formatNumber(data.usage.emailsVerified)} of {formatNumber(data.usage.emailsLimit)} verified this month
      </TooltipContent>
    </Tooltip>
  );
}

/** Back to the searches list, for every screen below it. */
export function BackButton() {
  return (
    <Button variant="glass" size="icon" aria-label="Back to searches" onClick={() => navigate({ name: 'searches' })}>
      <ChevronLeft className="size-[18px] -translate-x-px" />
    </Button>
  );
}

/**
 * The top strip of every screen and the window's drag handle. Leading on the
 * left (the mark, or a back button), the screen's actions and the account on
 * the right, room for the caption buttons on Windows and Linux. The island
 * floats over its center.
 */
export function PageHeader({
  leading,
  actions,
  newSearch = true,
}: {
  leading?: ReactNode;
  actions?: ReactNode;
  newSearch?: boolean;
}) {
  return (
    <header className="app-drag relative z-20 flex h-(--titlebar-height) shrink-0 items-center gap-2 pr-titlebar pl-4 mac:pl-[84px] mac:fullscreen:pl-4">
      {leading ?? (
        <a
          href={routeHref({ name: 'searches' })}
          aria-label="Searches"
          className="group flex items-center gap-2 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <LogoMark motion="hover" className="size-[22px]" />
          {transportMode === 'mock' && <span className="text-xs text-muted-foreground">Demo</span>}
        </a>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <UpdateButton />
        {actions}
        {newSearch && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="glass" className="pr-4 pl-3" onClick={() => navigate({ name: 'new', kind: null })}>
                <Plus className="size-[18px] text-primary" strokeWidth={2.25} />
                New search
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              New search <Kbd>{modKey} N</Kbd>
            </TooltipContent>
          </Tooltip>
        )}
        <AccountButton />
      </div>
    </header>
  );
}

/** A screen's display title: large, tight, set in the display face. */
export function DisplayTitle({
  children,
  subtitle,
  className,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('pt-10 pb-10', className)}>
      <h1 className="font-display text-4xl font-semibold text-balance">{children}</h1>
      {subtitle && <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

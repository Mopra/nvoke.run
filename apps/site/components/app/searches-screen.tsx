'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Ban, ClipboardList, Globe, MapPin, MoreHorizontal, Rocket, Sparkles, Trash2, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import type { Search, SiteProfile } from '@nvoke/shared';
import { DeleteSearchDialog } from '@/components/app/delete-search-dialog';
import { DeleteSiteProfileDialog } from '@/components/app/delete-site-profile-dialog';
import { StatusDot } from '@/components/app/indicators';
import { Figure, useArrivals } from '@/components/app/motion';
import { progressCaption, SearchProgress } from '@/components/app/search-progress';
import { APP_FRAME, APP_INSET, KeyGroup, LedKey } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, formatNumber, isActive, relativeTime, searchSubtitle, searchTitle, STATUS_LABEL } from '@/lib/app/desktop';
import { useCancelSearch, useLatestProfileBuild, useRefreshWhenFinished, useSearches, useSiteProfile } from '@/lib/app/queries';
import { displayDomain, PROFILE_PATH, WEBSITE_PATH } from '@/lib/app/site-profile';
import { cn } from '@/lib/utils';

const href = (search: Search): string => `/app/searches/${search.id}`;

const MENU_TRIGGER =
  'pointer-events-auto text-muted-foreground sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100';

function RowMenu({ search }: { search: Search }) {
  const [confirm, setConfirm] = useState(false);
  const cancel = useCancelSearch();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${searchTitle(search)}`} className={MENU_TRIGGER}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={href(search)}>
              <ArrowUpRight />
              Open
            </Link>
          </DropdownMenuItem>
          {isActive(search.status) && (
            <DropdownMenuItem
              onSelect={() =>
                cancel.mutate(search.id, {
                  onSuccess: () => toast('Search stopped', { description: 'Everything found so far is kept.' }),
                  onError: (err) => toast.error('Couldn’t stop the search', { description: err.message }),
                })
              }
            >
              <Ban />
              Stop search
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteSearchDialog search={search} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}

function WebsiteMenu({ profile }: { profile: SiteProfile }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${profile.profile.name}`} className={MENU_TRIGGER}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={PROFILE_PATH}>
              <ArrowUpRight />
              Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteSiteProfileDialog profile={profile} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}

/** The kind tag: one word, and which keycap color it prints on. */
const KIND_TAG: Record<string, [label: string, variant: 'default' | 'secondary' | 'outline']> = {
  local: ['Local', 'secondary'],
  web: ['Web', 'secondary'],
  launches: ['Launches', 'secondary'],
  domains: ['List', 'secondary'],
  drop: ['Drop', 'default'],
  icp: ['Describe', 'outline'],
};

function KindTag({ kind }: { kind: string }) {
  const [label, variant] = KIND_TAG[kind] ?? ['Search', 'secondary'];
  return <Badge variant={variant}>{label}</Badge>;
}

/** The channel number, two digits at the row's left edge. */
function Channel({ index }: { index: number }) {
  return <span className="cap hidden text-muted-foreground md:block">{String(index + 1).padStart(2, '0')}</span>;
}

/*
 * The list is a table with instrument channels for rows: the channel number,
 * the search, its kind, its status, the emails found and how many are valid.
 * Hairlines between rows, no boxes. On a phone a row keeps the title, the
 * figure and the menu, with the kind and the status under the title.
 */
const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-x-4 md:grid-cols-[36px_minmax(0,1fr)_110px_170px_84px_56px_28px] lg:grid-cols-[36px_minmax(0,1fr)_140px_200px_92px_64px_28px]';
const ROW =
  'group relative border-t border-border transition-colors duration-200 last:border-b hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]';
const ROW_LINK = 'absolute inset-0 outline-none';
const ROW_BODY = cn('pointer-events-none relative py-4', APP_INSET, GRID);
const ROW_TITLE = 'truncate font-display text-base';
const ROW_SUBTITLE = 'mt-1 truncate font-mono text-[12px] tracking-[0.04em] text-muted-foreground uppercase';
const ROW_FIGURE = 'text-right font-display text-3xl font-light tracking-[-0.02em] tabular-nums';
const ROW_VALID = 'hidden text-right font-mono text-base tabular-nums text-muted-foreground md:block';
const MENU = 'pointer-events-auto -mr-1 flex justify-end';

/** The status column: an LED and, while running, the meter, otherwise one word. */
function Status({ search }: { search: Search }) {
  const active = isActive(search.status);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <StatusDot status={search.status} />
      {active ? (
        <SearchProgress search={search} className="h-2.5 w-24 shrink-0" />
      ) : (
        <span className="cap truncate text-muted-foreground">{STATUS_LABEL[search.status]}</span>
      )}
    </div>
  );
}

/** On a phone the kind and the status sit under the title. */
function PhoneLine({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex items-center gap-3 md:hidden">{children}</div>;
}

function SearchRow({ search, index, style }: { search: Search; index: number; style?: CSSProperties }) {
  const active = isActive(search.status);
  const stopped = search.status === 'failed' || search.status === 'canceled';
  const detail = active
    ? (search.stageNote ?? progressCaption(search))
    : search.status === 'failed'
      ? errorMessage(search.error)
      : [
          searchSubtitle(search),
          relativeTime(search.createdAt),
          search.ongoing && !stopped ? (search.stageNote ?? 'keeps finding new leads') : null,
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <div style={style} className={ROW}>
      <Link
        href={href(search)}
        data-search-status={search.status}
        data-search-kind={search.kind}
        aria-label={searchTitle(search)}
        className={ROW_LINK}
      />
      <div className={ROW_BODY}>
        <Channel index={index} />
        <div className="min-w-0">
          <div className={ROW_TITLE} title={searchTitle(search)}>
            {searchTitle(search)}
          </div>
          <div className={ROW_SUBTITLE} title={detail}>
            {detail}
          </div>
          <PhoneLine>
            <KindTag kind={search.kind} />
            <Status search={search} />
          </PhoneLine>
        </div>
        <div className="hidden md:block">
          <KindTag kind={search.kind} />
        </div>
        <div className="hidden md:block">
          <Status search={search} />
        </div>
        <div className={ROW_FIGURE}>
          <Figure value={search.emailsFound} />
        </div>
        <div className={ROW_VALID}>{stopped && search.emailsFound === 0 ? '' : formatNumber(search.emailsValid)}</div>
        <div className={MENU}>
          <RowMenu search={search} />
        </div>
      </div>
    </div>
  );
}

/** The website read's status: running while nvoke reads the site, then the searches it planned. */
function WebsiteStatus({ reading, planned }: { reading: boolean; planned: number }) {
  return reading ? (
    <div className="flex items-center gap-2.5">
      <StatusDot status="running" />
      <div className="h-2.5 w-24 overflow-hidden bg-foreground/15">
        <div className="h-full w-1/4 bg-primary motion-safe:animate-indeterminate" />
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2.5">
      <span className="led bg-chart-2" />
      <span className="cap text-muted-foreground">{planned === 1 ? '1 planned' : `${formatNumber(planned)} planned`}</span>
    </div>
  );
}

/**
 * The website read sits on the list like a search: running while nvoke reads
 * the site, then planned until the user picks its searches. New search always
 * starts fresh, so this row is the way back to it.
 */
function WebsiteRow() {
  const profile = useSiteProfile();
  const latest = useLatestProfileBuild();
  const reading = latest?.status === 'pending' ? latest.build.domain : null;
  if (!reading && !profile.data) return null;
  const planned = profile.data?.suggestions.length ?? 0;
  const title = reading ?? profile.data!.profile.name;
  return (
    <div className={ROW}>
      <Link href={PROFILE_PATH} aria-label={title} className={ROW_LINK} />
      <div className={ROW_BODY}>
        <Channel index={-1} />
        <div className="min-w-0">
          <div className={cn(ROW_TITLE, reading && 'font-mono font-normal tracking-tight')}>{title}</div>
          <div className={ROW_SUBTITLE}>
            {reading
              ? 'Reading your website · planning searches'
              : `Your website · ${displayDomain(profile.data!.website)} · ${relativeTime(profile.data!.updatedAt)}`}
          </div>
          <PhoneLine>
            <Badge variant="default">Website</Badge>
            <WebsiteStatus reading={!!reading} planned={planned} />
          </PhoneLine>
        </div>
        <div className="hidden md:block">
          <Badge variant="default">Website</Badge>
        </div>
        <div className="hidden md:block">
          <WebsiteStatus reading={!!reading} planned={planned} />
        </div>
        <div className={ROW_FIGURE}>{reading ? '' : formatNumber(planned)}</div>
        <div className={ROW_VALID} />
        <div className={MENU}>{!reading && <WebsiteMenu profile={profile.data!} />}</div>
      </div>
    </div>
  );
}

/** The column headers. */
function TableHead() {
  return (
    <div className={cn('cap hidden pb-2 text-muted-foreground md:grid', APP_INSET, GRID)}>
      <span>Ch</span>
      <span>Search</span>
      <span>Kind</span>
      <span>Status</span>
      <span className="text-right">Emails</span>
      <span className="text-right">Valid</span>
      <span />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={cn('border-t border-border py-5 last:border-b', APP_INSET, GRID)}>
          <Skeleton className="hidden h-3 w-5 md:block" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="hidden h-5 w-16 md:block" />
          <Skeleton className="hidden h-3 w-20 md:block" />
          <Skeleton className="ml-auto h-7 w-12" />
          <Skeleton className="ml-auto hidden h-4 w-8 md:block" />
          <span />
        </div>
      ))}
    </div>
  );
}

function Section({ searches, offset = 0, arrive }: { searches: Search[]; offset?: number; arrive: (key: string) => CSSProperties }) {
  if (searches.length === 0) return null;
  return (
    <section className="stagger flex flex-col">
      {searches.map((s, i) => (
        <SearchRow key={s.id} search={s} index={offset + i} style={arrive(s.id)} />
      ))}
    </section>
  );
}

/** The two ways to start, under a bracket: describe your customer in plain words, or start from your website. */
function StartKeys() {
  return (
    <KeyGroup label="Start">
      <LedKey>
        <Button asChild variant="secondary">
          <Link href={WEBSITE_PATH}>Website</Link>
        </Button>
      </LedKey>
      <LedKey on>
        <Button asChild>
          <Link href="/app/new">
            <span className="led bg-primary-foreground" />
            Describe
          </Link>
        </Button>
      </LedKey>
    </KeyGroup>
  );
}

const BY_HAND = [
  { kind: 'local', icon: MapPin, title: 'Local' },
  { kind: 'web', icon: Globe, title: 'Web' },
  { kind: 'launches', icon: Rocket, title: 'Launches' },
  { kind: 'domains', icon: ClipboardList, title: 'List' },
] as const;

/** The first visit: one orange key, Describe your customer, and light keys for the other ways to search. */
function FirstSearch() {
  return (
    <EmptyState
      icon={UsersRound}
      title="Who do you sell to?"
      action={
        <div className="flex flex-col items-center gap-8">
          <Button asChild size="lg">
            <Link href="/app/new">
              Describe your customer
              <ArrowRight />
            </Link>
          </Button>
          <nav aria-label="Other ways to search" className="flex flex-wrap items-center justify-center gap-2">
            <span className="cap mr-1 text-muted-foreground">Or</span>
            <Button asChild variant="secondary" size="sm">
              <Link href={WEBSITE_PATH}>
                <Sparkles />
                Website
              </Link>
            </Button>
            {BY_HAND.map(({ kind, icon: Icon, title }) => (
              <Button key={kind} asChild variant="secondary" size="sm">
                <Link href={`/app/new?kind=${kind}`}>
                  <Icon />
                  {title}
                </Link>
              </Button>
            ))}
          </nav>
        </div>
      }
    >
      Say it in plain words. nvoke plans the searches, reads every site and finds the people who decide. Only verified
      emails count toward your plan.
    </EmptyState>
  );
}

export function SearchesScreen() {
  const { data, error, isPending, refetch } = useSearches();
  const active = data?.filter((s) => isActive(s.status)) ?? [];
  const earlier = data?.filter((s) => !isActive(s.status)) ?? [];
  // The list is polled: a new search, or one that just finished and moved down, comes in; the rest stay still.
  const arrive = useArrivals([...active, ...earlier].map((s) => s.id));

  // The list is polled; the account needs a refresh when the last search ends.
  useRefreshWhenFinished(active.length > 0, null);

  const empty = !!data && data.length === 0;
  const subtitle = data && data.length > 0 ? `${data.length}${active.length ? ` / ${active.length} run` : ''}` : null;

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-8 pb-5')}>
        <h1 className="font-display text-3xl font-light tracking-[-0.02em] sm:text-4xl">
          Searches
          {subtitle && <span className="cap ml-3 align-top text-primary">{subtitle}</span>}
        </h1>
        {!empty && <StartKeys />}
      </div>
      {isPending ? (
        <>
          <TableHead />
          <ListSkeleton />
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <>
          <WebsiteRow />
          <FirstSearch />
        </>
      ) : (
        <>
          <TableHead />
          <WebsiteRow />
          <Section searches={active} arrive={arrive} />
          <Section searches={earlier} offset={active.length} arrive={arrive} />
        </>
      )}
    </main>
  );
}

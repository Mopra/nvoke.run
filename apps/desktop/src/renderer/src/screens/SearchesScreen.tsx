import { useRef, useState, type CSSProperties } from 'react';
import { useMutationState } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Ban, MoreHorizontal, Trash2, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { KeyGroup, LedKey, ScrollShade } from '@/components/AppShell';
import { DeleteSearchDialog } from '@/components/DeleteSearchDialog';
import { DeleteSiteProfileDialog } from '@/components/DeleteSiteProfileDialog';
import { StatusDot } from '@/components/indicators';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { EmptyState, ErrorState } from '@/components/states';
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
import {
  errorMessage,
  formatNumber,
  isActive,
  offlineCaption,
  relativeTime,
  searchSubtitle,
  searchTitle,
  STATUS_LABEL,
} from '@/lib/format';
import { BUILD_SITE_PROFILE, useCancelSearch, useLocalStatus, useRefreshWhenFinished, useSearches, useSiteProfile } from '@/lib/queries';
import { parseWebsite } from '@/lib/site-profile';
import { CountUp, useStagger } from '@/lib/motion';
import { navigate, routeHref } from '@/lib/router';
import type { Search } from '@/lib/types';
import type { SiteProfile } from '@nvoke/shared';
import { cn } from '@/lib/utils';

function RowMenu({ search }: { search: Search }) {
  const [confirm, setConfirm] = useState(false);
  const cancel = useCancelSearch();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${searchTitle(search)}`}
            className="pointer-events-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => navigate({ name: 'search', id: search.id })}>
            <ArrowUpRight />
            Open
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${profile.profile.name}`}
            className="pointer-events-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => navigate({ name: 'website' })}>
            <ArrowUpRight />
            Open
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
  return <span className="cap text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>;
}

/*
 * The list is a table with instrument channels for rows: the channel number,
 * the search, its kind, its status, the emails found and how many are valid.
 * Hairlines between rows, no boxes.
 */
const GRID = 'grid grid-cols-[36px_minmax(0,1fr)_140px_200px_92px_64px_28px] items-center gap-4';
const ROW = 'group relative border-t border-border transition-colors duration-200 last:border-b hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]';
const ROW_LINK = 'absolute inset-0 outline-none';
const ROW_BODY = cn('pointer-events-none relative py-4', GRID);
const ROW_TITLE = 'truncate font-display text-base';
const ROW_SUBTITLE = 'mt-1 truncate font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground uppercase';
const ROW_FIGURE = 'text-right font-display text-3xl font-light tracking-[-0.02em] tabular-nums';
const ROW_VALID = 'text-right font-mono text-base tabular-nums text-muted-foreground';
const MENU = 'pointer-events-auto flex justify-end';

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

function SearchRow({ search, index, style }: { search: Search; index: number; style?: CSSProperties }) {
  const active = isActive(search.status);
  const stopped = search.status === 'failed' || search.status === 'canceled';
  const detail = active
    ? progressCaption(search)
    : search.status === 'failed'
      ? errorMessage(search.error)
      : [searchSubtitle(search), relativeTime(search.createdAt), search.ongoing && !stopped ? 'keeps finding new leads' : null]
          .filter(Boolean)
          .join(' \u00b7 ');
  return (
    <div style={style} className={ROW}>
      <a
        href={routeHref({ name: 'search', id: search.id })}
        data-search-status={search.status}
        data-search-kind={search.kind}
        aria-label={searchTitle(search)}
        className={ROW_LINK}
      />
      <div className={ROW_BODY}>
        <Channel index={index} />
        <div className="min-w-0">
          <div className={ROW_TITLE}>{searchTitle(search)}</div>
          <div className={ROW_SUBTITLE} title={detail}>
            {detail}
          </div>
        </div>
        <div>
          <KindTag kind={search.kind} />
        </div>
        <Status search={search} />
        <div className={ROW_FIGURE}>
          <CountUp value={search.emailsFound} />
        </div>
        <div className={ROW_VALID}>{stopped && search.emailsFound === 0 ? '' : formatNumber(search.emailsValid)}</div>
        <div className={MENU}>
          <RowMenu search={search} />
        </div>
      </div>
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
  const running = useMutationState({
    filters: { mutationKey: BUILD_SITE_PROFILE, status: 'pending' },
    select: (m) => String(m.state.variables ?? ''),
  }).at(-1);
  const reading = running === undefined ? null : (parseWebsite(running)?.domain ?? running);
  if (reading === null && !profile.data) return null;
  const planned = profile.data?.suggestions.length ?? 0;
  const title = reading ?? profile.data!.profile.name;
  return (
    <div className={ROW}>
      <a href={routeHref({ name: 'website' })} aria-label={title} className={ROW_LINK} />
      <div className={ROW_BODY}>
        <Channel index={-1} />
        <div className="min-w-0">
          <div className={cn(ROW_TITLE, reading !== null && 'font-mono font-normal tracking-tight')}>{title}</div>
          <div className={ROW_SUBTITLE}>
            {reading !== null
              ? 'Reading your website \u00b7 planning searches'
              : `Your website \u00b7 ${profile.data!.domain} \u00b7 ${relativeTime(profile.data!.updatedAt)}`}
          </div>
        </div>
        <div>
          <Badge variant="default">Website</Badge>
        </div>
        <div className="flex items-center gap-2.5">
          {reading !== null ? (
            <>
              <StatusDot status="running" />
              <div className="h-2.5 w-24 overflow-hidden bg-foreground/15">
                <div className="h-full w-1/4 bg-primary motion-safe:animate-indeterminate" />
              </div>
            </>
          ) : (
            <>
              <span className="led bg-chart-2" />
              <span className="cap text-muted-foreground">{planned === 1 ? '1 planned' : `${formatNumber(planned)} planned`}</span>
            </>
          )}
        </div>
        <div className={ROW_FIGURE}>{reading === null ? formatNumber(planned) : ''}</div>
        <div className={ROW_VALID} />
        <div className={MENU}>{reading === null && <WebsiteMenu profile={profile.data!} />}</div>
      </div>
    </div>
  );
}

/** The column headers. */
function TableHead() {
  return (
    <div className={cn('cap pb-2 text-muted-foreground', GRID)}>
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
        <div key={i} className={cn('border-t border-border py-5 last:border-b', GRID)}>
          <Skeleton className="h-3 w-5" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-7 w-12" />
          <Skeleton className="ml-auto h-4 w-8" />
          <span />
        </div>
      ))}
    </div>
  );
}

function Section({ searches, offset = 0 }: { searches: Search[]; offset?: number }) {
  const stagger = useStagger();
  if (searches.length === 0) return null;
  return (
    <section className="stagger flex flex-col">
      {searches.map((s, i) => (
        <SearchRow key={s.id} search={s} index={offset + i} style={stagger.style(offset + i)} />
      ))}
    </section>
  );
}

/** The two ways to start, under a bracket: describe your customer in plain words, or start from your website. */
function StartKeys() {
  return (
    <KeyGroup label="Start">
      <LedKey>
        <Button variant="secondary" onClick={() => navigate({ name: 'new', kind: 'website' })}>
          Website
        </Button>
      </LedKey>
      <LedKey on>
        <Button onClick={() => navigate({ name: 'new', kind: null })}>
          <span className="led bg-primary-foreground" />
          Describe
        </Button>
      </LedKey>
    </KeyGroup>
  );
}

export function SearchesScreen() {
  const { data, error, isPending, refetch } = useSearches();
  const scrollRef = useRef<HTMLElement>(null);
  const active = data?.filter((s) => isActive(s.status)) ?? [];
  const earlier = data?.filter((s) => !isActive(s.status)) ?? [];

  // Only the account needs a refresh here; the list itself is still polled.
  useRefreshWhenFinished(active.length > 0, null);

  const offline = offlineCaption(useLocalStatus().data);
  const subtitle = !data
    ? null
    : data.length > 0
      ? [`${data.length}${active.length ? ` / ${active.length} run` : ''}`, offline].filter(Boolean).join(' \u00b7 ')
      : offline;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <main ref={scrollRef} className="flex-1 overflow-auto px-9 pb-16">
        <div className="motion-safe:animate-view-in">
          <div className="flex items-end justify-between pt-6 pb-5">
            <h1 className="font-display text-4xl font-light tracking-[-0.02em]">
              Searches
              {subtitle && <span className="cap ml-3 align-top text-primary">{subtitle}</span>}
            </h1>
            <StartKeys />
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
              <EmptyState
                icon={UsersRound}
                title="Who do you sell to?"
                action={
                  <Button size="lg" onClick={() => navigate({ name: 'new', kind: null })}>
                    Describe your customer
                    <ArrowRight />
                  </Button>
                }
              >
                Say it in plain words. nvoke plans the searches, reads every site and finds the people who decide.
              </EmptyState>
            </>
          ) : (
            <>
              <TableHead />
              <WebsiteRow />
              <Section searches={active} />
              <Section searches={earlier} offset={active.length} />
            </>
          )}
        </div>
      </main>
      <ScrollShade of={scrollRef} />
    </div>
  );
}

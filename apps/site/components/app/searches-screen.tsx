'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Ban, ClipboardList, Globe, MapPin, MoreHorizontal, Plus, Rocket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Search } from '@nvoke/shared';
import { DeleteSearchDialog } from '@/components/app/delete-search-dialog';
import { StatusDot } from '@/components/app/indicators';
import { progressCaption, SearchProgress } from '@/components/app/search-progress';
import { DisplayTitle } from '@/components/app/shell';
import { ErrorState } from '@/components/app/states';
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
import { useCancelSearch, useRefreshWhenFinished, useSearches } from '@/lib/app/queries';

const href = (search: Search): string => `/app/searches/${search.id}`;

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
            className="pointer-events-auto text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
          >
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

function SearchRow({ search }: { search: Search }) {
  const active = isActive(search.status);
  const stopped = search.status === 'failed' || search.status === 'canceled';
  return (
    <div className="group relative rounded-[24px] transition-colors duration-200 hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]">
      <Link
        href={href(search)}
        data-search-status={search.status}
        aria-label={searchTitle(search)}
        className="absolute inset-0 rounded-[24px] outline-none"
      />
      <div className="pointer-events-none relative flex items-center gap-4 px-4 py-5 sm:gap-8 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {(active || search.status === 'failed') && <StatusDot status={search.status} />}
            <span className="truncate font-display text-lg font-medium">{searchTitle(search)}</span>
          </div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {stopped || active ? `${STATUS_LABEL[search.status]}, ` : ''}
            {searchSubtitle(search).toLowerCase()}, {relativeTime(search.createdAt)}
          </div>
          {active && (
            <div className="mt-4 flex max-w-md flex-wrap items-center gap-x-4 gap-y-2">
              <SearchProgress search={search} className="h-[3px] min-w-32 flex-1" />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
            </div>
          )}
          {search.status === 'failed' && (
            <div className="mt-1 truncate text-xs text-muted-foreground/80">{errorMessage(search.error)}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl font-light tabular-nums">{formatNumber(search.emailsFound)}</div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {stopped && search.emailsFound === 0 ? 'no emails' : `emails, ${formatNumber(search.emailsValid)} valid`}
          </div>
        </div>
        <div className="pointer-events-auto -mr-2 flex w-7 justify-end">
          <RowMenu search={search} />
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-8 px-6 py-6">
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ searches }: { searches: Search[] }) {
  if (searches.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 [&+&]:mt-10">
      {searches.map((s) => (
        <SearchRow key={s.id} search={s} />
      ))}
    </section>
  );
}

const STARTERS = [
  { kind: 'local', icon: MapPin, title: 'Local businesses', text: 'Dentists in Austin, bakeries in Lyon: a niche and a place.' },
  { kind: 'web', icon: Globe, title: 'Web search', text: 'Company sites for a keyword, in any country.' },
  { kind: 'domains', icon: ClipboardList, title: 'Paste a list', text: 'Domains or company names you already have.' },
  { kind: 'launches', icon: Rocket, title: 'New launches', text: 'Fresh startups from Product Hunt and Show HN.' },
] as const;

/** The first visit: what nvoke can look for, one click from each. */
function FirstSearch() {
  return (
    <section className="px-2 pb-10 sm:px-6">
      <p className="max-w-lg text-base text-muted-foreground">
        Pick where to look. nvoke finds the companies, reads their own websites and checks every email with the mail
        server. Only verified emails count toward your plan.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {STARTERS.map(({ kind, icon: Icon, title, text }) => (
          <Link
            key={kind}
            href={`/app/new?kind=${kind}`}
            className="group flex items-start gap-4 rounded-[24px] bg-foreground/[0.035] p-5 outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-8">
        <Button asChild size="lg">
          <Link href="/app/new">
            <Plus />
            New search
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function SearchesScreen() {
  const { data, error, isPending, refetch } = useSearches();
  const active = data?.filter((s) => isActive(s.status)) ?? [];
  const earlier = data?.filter((s) => !isActive(s.status)) ?? [];

  // The list is polled; the account needs a refresh when the last search ends.
  useRefreshWhenFinished(active.length > 0, null);

  const subtitle = !data
    ? 'Loading'
    : data.length > 0
      ? [`${data.length} ${data.length === 1 ? 'search' : 'searches'}`, active.length ? `${active.length} running` : null]
          .filter(Boolean)
          .join(', ')
      : 'Start your first one. Results show up here as nvoke finds them.';

  return (
    <main className="w-full px-4 pb-24 sm:px-8">
      <div className="mx-auto max-w-[880px] motion-safe:animate-rise">
        <DisplayTitle className="px-2 sm:px-6" subtitle={subtitle}>
          Searches
        </DisplayTitle>
        {isPending ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <FirstSearch />
        ) : (
          <>
            <Section searches={active} />
            <Section searches={earlier} />
          </>
        )}
      </div>
    </main>
  );
}

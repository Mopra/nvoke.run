'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, ListPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEARCH_LIMIT_MAX, type Search } from '@nvoke/shared';
import { SearchFields } from '@/components/app/search-fields';
import { Button } from '@/components/ui/button';
import { isQuotaError } from '@/lib/app/api';
import { formatNumber, isActive, KIND_LABEL, runsAdded, runTitle, searchRuns } from '@/lib/app/desktop';
import { cn } from '@/lib/utils';
import { BILLING_PATH } from '@/lib/app/quota';
import { useMe, useSearchMore } from '@/lib/app/queries';
import { buildSearchInput, formFromSearch, formProblem, type FormKind, type SearchForm } from '@/lib/app/search-form';

/** What widening a search of each kind means, for the invitation when it found few. */
const WIDEN: Record<FormKind, string> = {
  local: 'another place or trade',
  web: 'another keyword or country',
  launches: 'a longer window or another keyword',
  domains: 'more companies',
};

/** The runs of a search that ran more than once, each with what it added: "Dentists in Aarhus 37". */
export function RunsLine({ search }: { search: Search }) {
  const runs = searchRuns(search);
  if (runs.length <= 1) return null;
  const added = runsAdded(search);
  return (
    <ol data-search-runs className="cap flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground" aria-label="Runs of this search">
      {runs.map((run, i) => (
        <li key={`${run.createdAt}-${i}`} className="flex min-w-0 items-baseline gap-1.5">
          <span className="max-w-72 truncate" title={runTitle({ kind: search.kind, params: run.params } as Search)}>
            {runTitle({ kind: search.kind, params: run.params } as Search)}
          </span>
          <span className={cn('tabular-nums', i === runs.length - 1 && isActive(search.status) ? 'text-primary' : 'text-foreground')}>
            {i === runs.length - 1 && search.status === 'queued' ? '…' : `+${formatNumber(Math.max(0, added[i] ?? 0))}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The quiet invitation under a search that came back with fewer companies than it asked for. */
export function FoundFewNote({ search, onSearchMore }: { search: Search & { kind: FormKind }; onSearchMore: () => void }) {
  const n = search.companiesFound;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
      <Button variant="secondary" onClick={onSearchMore}>
        <ListPlus />
        Search more
      </Button>
      <span className="min-w-0 flex-1 text-sm text-pretty text-muted-foreground">
        <span className="text-foreground">{n === 0 ? 'Nothing so far.' : `Only ${formatNumber(n)} so far.`}</span> Widen it: {WIDEN[search.kind]}.
      </span>
    </div>
  );
}

/**
 * Search more, under the display in place of its keys: the New search sentence for the
 * search's kind, filled in from its latest run. Submitting runs the same
 * search again; only companies it does not hold yet are added.
 */
export function SearchMorePanel({ search, onClose }: { search: Search & { kind: FormKind }; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<SearchForm>(() => formFromSearch(search));
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const listField = useRef<HTMLTextAreaElement>(null);
  const more = useSearchMore(search.id);
  const me = useMe();
  const maxLimit = me.data?.maxSearchLimit ?? SEARCH_LIMIT_MAX;
  const input = buildSearchInput(form, maxLimit);
  const problem = touched ? formProblem(form, maxLimit) : null;

  useEffect(() => {
    (search.kind === 'domains' ? listField.current : firstField.current)?.focus();
  }, [search.kind]);

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (!input || more.isPending) return;
    more.mutate(input, {
      onSuccess: () => {
        toast.success('Searching more', { description: runTitle({ kind: input.kind, params: input.params } as Search) });
        onClose();
      },
      onError: (err) => {
        if (isQuotaError(err)) {
          toast.error('This month’s verified emails are used up', {
            description: 'Upgrade to keep searching now, or wait for the reset.',
            action: { label: 'Upgrade', onClick: () => router.push(BILLING_PATH) },
          });
          return;
        }
        toast.error('Couldn’t search more', { description: err.message });
      },
    });
  }

  return (
    <section className="motion-safe:animate-rise" aria-labelledby="search-more-title">
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          // Not when Escape just closed a picker or menu inside the form.
          if (e.key === 'Escape' && !e.nativeEvent.defaultPrevented) onClose();
        }}
        noValidate
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="search-more-title" className="cap text-foreground">
            Search more into this list
          </h2>
          <span className="text-sm text-muted-foreground">{KIND_LABEL[search.kind]}. Companies it holds are skipped.</span>
        </div>
        <SearchFields
          className="mt-8"
          form={form}
          onChange={setForm}
          touched={touched}
          maxLimit={maxLimit}
          firstField={firstField}
          listField={listField}
          more
        />
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" variant="dark" disabled={more.isPending} className="min-w-40">
            {more.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
            Search more
            {!more.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          {problem ? (
            <span className="text-sm text-destructive">{problem}</span>
          ) : (
            <span className="text-sm text-muted-foreground">
              It holds {formatNumber(search.companiesFound)} {search.companiesFound === 1 ? 'company' : 'companies'} now.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

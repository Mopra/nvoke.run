import { useEffect, useRef, type FormEvent } from 'react';
import { CornerDownLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SearchFields, SearchFootnote, useSearchForm, type FormKind } from '@/components/SearchForm';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { BILLING_URL } from '@/lib/env';
import { formatNumber, runsAdded, runTitle, searchRuns } from '@/lib/format';
import { useSearchMore } from '@/lib/queries';
import type { Search, SearchInput } from '@/lib/types';

/** What widening means for each kind, after "Widen it:". */
const WIDEN: Record<FormKind, string> = {
  local: 'another place or trade adds to this list.',
  web: 'another keyword or country adds to this list.',
  launches: 'a longer window or another keyword adds to this list.',
  domains: 'paste more companies and they join this list.',
};

/** A search can take another run once it ended, unless a drop made it. Describe your customer keeps pushing on its own. */
export function canSearchMore(search: Search): search is Exclude<Search, { kind: 'drop' | 'icp' }> {
  return search.kind !== 'drop' && search.kind !== 'icp' && search.status !== 'queued' && search.status !== 'running';
}

/**
 * The run that picks a stopped search up where it left off: the latest run's
 * words again, for the companies its limit still had room for. Null when the
 * search was not stopped, is a pasted list (nothing left to find) or had
 * already reached its limit.
 */
export function continueInput(search: Search): SearchInput | null {
  if (search.status !== 'canceled' || !canSearchMore(search) || search.kind === 'domains') return null;
  const last = searchRuns(search).at(-1);
  if (!last) return null;
  const left = last.limit - (search.companiesFound - last.foundBefore);
  if (left < 1) return null;
  return { kind: search.kind, params: last.params, limit: left } as SearchInput;
}

/**
 * The invitation to widen a search that ended with few companies: none, or
 * under half of what it asked for. Null when it found plenty.
 */
export function fewFoundLine(search: Search): string | null {
  if (!canSearchMore(search)) return null;
  const found = search.companiesFound;
  if (found > 0 && found >= search.limit / 2) return null;
  const lead = found === 0 ? 'Nothing yet.' : `Only ${formatNumber(found)} so far.`;
  return `${lead} Widen it: ${WIDEN[search.kind]}`;
}

/** The runs of a search that ran more than once, each with what it added. Null for a single run. */
export function RunsLine({ search }: { search: Search }) {
  const runs = searchRuns(search);
  if (runs.length <= 1) return null;
  const added = runsAdded(search);
  return (
    <ol data-search-runs className="cap mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
      {runs.map((run, i) => (
        <li key={`${run.createdAt}-${i}`} className="flex items-baseline gap-1.5">
          <span className="max-w-72 truncate">{runTitle({ kind: search.kind, params: run.params } as Search)}</span>
          <span className="tabular-nums text-primary">+{formatNumber(Math.max(0, added[i] ?? 0))}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Another run of the search, in place: the New search sentence of its kind,
 * filled with the latest run's words (a list starts empty, for what is new).
 * On success the search is live again and the editor closes.
 */
export function SearchMoreEditor({ search, onClose }: { search: Exclude<Search, { kind: 'drop' | 'icp' }>; onClose: () => void }) {
  const last = searchRuns(search).at(-1);
  const form = useSearchForm(search.kind, { params: search.params, limit: last?.limit ?? 100 });
  const more = useSearchMore(search.id);
  const firstField = useRef<HTMLInputElement>(null);
  const listField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = search.kind === 'domains' ? listField.current : firstField.current;
    field?.focus();
    if (field instanceof HTMLInputElement) field.select();
  }, [search.kind]);

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    form.setTouched(true);
    const input = form.input;
    if (!input || more.isPending) return;
    more.mutate(input, {
      onSuccess: () => {
        toast.success('Searching more', { description: `${runTitle(input as Search)}, into this list` });
        onClose();
      },
      onError: (err) => {
        const quota = err instanceof ApiError && err.code === 'quota_exceeded';
        toast.error('Couldn’t search more', {
          description: err.message,
          action: quota ? { label: 'Upgrade', onClick: () => void api.openExternal(BILLING_URL) } : undefined,
        });
      },
    });
  }

  return (
    <form
      data-search-more
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.stopPropagation();
          onClose();
        }
      }}
      noValidate
      className="mt-10 motion-safe:animate-rise"
      aria-label="Search more"
    >
      <p className="mb-8 text-sm text-muted-foreground">
        Same list, new words. Companies it already holds are skipped, so only new ones count.
      </p>
      <SearchFields form={form} firstField={firstField} listField={listField} more />
      <div className="mt-12 flex items-center gap-4">
        <Button type="submit" size="lg" disabled={more.isPending} className="min-w-40">
          {more.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
          Search more
          {!more.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <SearchFootnote form={form} />
      </div>
    </form>
  );
}

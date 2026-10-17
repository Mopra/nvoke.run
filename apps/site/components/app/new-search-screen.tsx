'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { SEARCH_LIMIT_MAX, type CreateSearchInput } from '@nvoke/shared';
import { SearchFields } from '@/components/app/search-fields';
import { APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { isQuotaError } from '@/lib/app/api';
import { formatNumber, searchTitle } from '@/lib/app/desktop';
import { BILLING_PATH, quotaState } from '@/lib/app/quota';
import { useCreateSearch, useMe } from '@/lib/app/queries';
import { WEBSITE_PATH } from '@/lib/app/site-profile';
import {
  buildSearchInput,
  emptyForm,
  formProblem,
  type FormKind,
  type SearchForm,
} from '@/lib/app/search-form';
import { cn } from '@/lib/utils';

const SOURCES: Record<FormKind, string> = {
  local: 'Businesses on OpenStreetMap with a website, inside the area you name.',
  web: 'Company sites from web search. No social networks, marketplaces or news.',
  launches: 'Fresh launches from Product Hunt and Show HN.',
  domains: 'Companies you already know. Domains are read as given, names are looked up on the web.',
};

const KINDS: { value: FormKind; label: string; icon: typeof MapPin }[] = [
  { value: 'local', label: 'Local businesses', icon: MapPin },
  { value: 'web', label: 'Web search', icon: Globe },
  { value: 'launches', label: 'New launches', icon: Rocket },
  { value: 'domains', label: 'Paste a list', icon: ClipboardList },
];

/**
 * Starts a search the way the form does: the same mutation and cache updates,
 * a toast, then the search's page. Suggestions from the website step use it too.
 */
export function useStartSearch() {
  const router = useRouter();
  const create = useCreateSearch();
  const start = (input: CreateSearchInput): void => {
    if (create.isPending) return;
    create.mutate(input, {
      onSuccess: (search) => {
        toast.success('Search started', { description: searchTitle(search) });
        router.replace(`/app/searches/${search.id}`);
      },
      onError: (err) => {
        if (isQuotaError(err)) {
          toast.error('This month’s verified emails are used up', {
            description: 'Upgrade to keep searching now, or wait for the reset.',
            action: { label: 'Upgrade', onClick: () => router.push(BILLING_PATH) },
          });
          return;
        }
        toast.error('Couldn’t start the search', { description: err.message });
      },
    });
  };
  return { start, isPending: create.isPending, pendingInput: create.isPending ? create.variables : undefined };
}

export function NewSearchScreen({ initialKind }: { initialKind: FormKind }) {
  const [form, setForm] = useState<SearchForm>(() => emptyForm(initialKind));
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const listField = useRef<HTMLTextAreaElement>(null);
  const create = useStartSearch();
  const me = useMe();

  const set = <K extends keyof SearchForm>(key: K) => (value: SearchForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    (form.kind === 'domains' ? listField.current : firstField.current)?.focus();
  }, [form.kind]);

  // The plan caps one search; the server clamps too, this keeps the form honest.
  const maxLimit = me.data?.maxSearchLimit ?? SEARCH_LIMIT_MAX;
  const input = buildSearchInput(form, maxLimit);
  const quota = me.data ? quotaState(me.data) : null;

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (!input) return;
    create.start(input);
  }

  const problem = touched ? formProblem(form, maxLimit) : null;

  return (
    <main className={cn(APP_FRAME, 'pb-24')}>
      <form onSubmit={submit} className={cn(APP_INSET, 'flex flex-col pt-8 motion-safe:animate-rise sm:pt-[6vh]')} noValidate>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BackLink />
          <Link
            href={WEBSITE_PATH}
            className="-mr-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <Sparkles className="size-3.5" />
            Plan from your website
          </Link>
        </div>
        <h1 className="sr-only">New search</h1>
        <div className="mt-6 flex flex-col items-start gap-3">
          <Segmented
            label="Where to look"
            value={form.kind}
            onChange={set('kind')}
            options={KINDS}
            className="hidden sm:inline-flex"
          />
          {/* Phones: the four kinds don't fit on one row, so they sit in a grid. */}
          <div role="radiogroup" aria-label="Where to look" className="grid w-full grid-cols-2 gap-2 sm:hidden">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={form.kind === k.value}
                onClick={() => set('kind')(k.value)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full px-3.5 py-1.5 text-left text-sm leading-tight font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  form.kind === k.value
                    ? 'bg-card text-foreground shadow-float dark:bg-foreground/15'
                    : 'bg-foreground/[0.055] text-muted-foreground',
                )}
              >
                <k.icon className="size-4 shrink-0" />
                <span>{k.label}</span>
              </button>
            ))}
          </div>
          <p className="pl-1 text-sm text-muted-foreground">{SOURCES[form.kind]}</p>
        </div>

        <div className="mt-12">
          <SearchFields form={form} onChange={setForm} touched={touched} maxLimit={maxLimit} firstField={firstField} listField={listField} />
        </div>

        <div className="mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Button type="submit" size="lg" disabled={create.isPending} className="min-w-40">
            {create.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
            Start search
            {!create.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
          </Button>
          {problem ? (
            <span className="text-sm text-destructive">{problem}</span>
          ) : quota?.level === 'out' ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              This month’s {formatNumber(quota.limit)} verified emails are used, so a search stops at once.{' '}
              <Link href={BILLING_PATH} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                Upgrade
                <ArrowUpRight className="size-3.5" />
              </Link>
            </p>
          ) : (
            <p className="max-w-sm text-xs text-muted-foreground">
              Only verified emails count.
              {quota && ` ${formatNumber(quota.left)} left this month.`}
              {me.data && form.kind !== 'domains' && form.limit > maxLimit && ` Max ${formatNumber(maxLimit)} companies per search.`}
              {' Checking each address with its mail server takes several minutes. Results are kept for 12 months.'}
            </p>
          )}
        </div>
      </form>
    </main>
  );
}

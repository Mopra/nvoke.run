'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket, Sparkles, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SEARCH_LIMIT_MAX, type CreateSearchInput, type Search } from '@nvoke/shared';
import { LimitKnob, SearchFields } from '@/components/app/search-fields';
import { APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { Button } from '@/components/ui/button';
import { isQuotaError } from '@/lib/app/api';
import { OPEN_FALLBACK_MS, searchPath, stillOpening } from '@/lib/app/navigation';
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

/** The kinds in order, with the short name the keycaps carry. */
const KINDS: { value: FormKind; label: string; short: string; icon: LucideIcon }[] = [
  { value: 'local', label: 'Local businesses', short: 'Local', icon: MapPin },
  { value: 'web', label: 'Web search', short: 'Web', icon: Globe },
  { value: 'launches', label: 'New launches', short: 'Launches', icon: Rocket },
  { value: 'domains', label: 'Paste a list', short: 'List', icon: ClipboardList },
];

/**
 * Starts a search the way the form does: the same mutation and cache updates,
 * a toast, then the search's page. Suggestions from the website step use it too.
 * The form stays pending until that page is open: a client navigation that
 * stalls (a cold route, a slow chunk) falls back to a full page load, so the
 * user never sits on a filled form with the search already running.
 */
export function useStartSearch() {
  const router = useRouter();
  const create = useCreateSearch();
  const [opening, setOpening] = useState<{ path: string; input: CreateSearchInput } | null>(null);

  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => {
      if (stillOpening(window.location.pathname, opening.path)) window.location.assign(opening.path);
    }, OPEN_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [opening]);

  /** `onStarted` runs before the search's page opens, for a follow up such as switching ongoing on. */
  const start = (input: CreateSearchInput, onStarted?: (search: Search) => void): void => {
    if (create.isPending || opening) return;
    create.mutate(input, {
      onSuccess: (search) => {
        onStarted?.(search);
        toast.success('Search started', { description: searchTitle(search) });
        const path = searchPath(search.id);
        setOpening({ path, input });
        router.replace(path);
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
  const pendingInput = create.isPending ? create.variables : opening?.input;
  return { start, isPending: create.isPending || opening !== null, pendingInput };
}

/**
 * The manual form as a panel: the kind keys on the left, the sentence in the
 * middle with the Start key under it, and the limit knob on the right. A list
 * has no limit, so its column stays empty. Below the wide layout the columns
 * stack and the limit keys under the sentence stand in for the knob.
 */
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
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <form onSubmit={submit} className={cn(APP_INSET, 'flex flex-col pt-6')} noValidate>
        <BackLink />
        <h1 className="sr-only">New search</h1>
        <div className="mt-6 mb-8 flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/new">
              <ArrowLeft className="size-3" />
              Describe your customer instead
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={WEBSITE_PATH}>
              <Sparkles className="size-3" />
              Plan from your website
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[196px_minmax(0,1fr)_210px]">
          <div className="flex flex-col gap-4">
            <KindKeys label="Where to look" value={form.kind} onChange={set('kind')} />
            <p key={form.kind} className="tab-in max-w-md text-sm text-muted-foreground">
              {SOURCES[form.kind]}
            </p>
          </div>

          <div className="flex min-w-0 flex-col pt-1">
            {/* Keyed by the kind, so a switch brings the new fields in. */}
            <div key={form.kind} className="tab-in">
              <SearchFields
                form={form}
                onChange={setForm}
                touched={touched}
                maxLimit={maxLimit}
                firstField={firstField}
                listField={listField}
                presets={false}
              />
            </div>
            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
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
                  <Link
                    href={BILLING_PATH}
                    className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Upgrade
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </p>
              ) : (
                <p className="max-w-sm text-sm text-muted-foreground">
                  Only verified emails count.
                  {quota && (
                    <>
                      {' '}
                      <span className="font-medium text-primary">{formatNumber(quota.left)}</span> left this month.
                    </>
                  )}
                  {me.data && form.kind !== 'domains' && form.limit > maxLimit && ` Max ${formatNumber(maxLimit)} companies per search.`}
                  {' Results are kept for 12 months.'}
                </p>
              )}
            </div>
          </div>

          <div className="hidden pt-1 lg:block">
            {form.kind !== 'domains' && <LimitKnob limit={form.limit} onChange={set('limit')} />}
          </div>
        </div>
      </form>
    </main>
  );
}

/**
 * The kind picker: four square keycaps in a block, the icon over a cap label,
 * an LED above each, the chosen one orange and lit. Radio semantics, arrow
 * keys move the choice. Two by two on the wide layout and on phones, one row
 * of four in between.
 */
function KindKeys({ label, value, onChange }: { label: string; value: FormKind; onChange: (kind: FormKind) => void }) {
  const refs = useRef(new Map<FormKind, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = KINDS.findIndex((k) => k.value === value);
    const next = KINDS[(index + step + KINDS.length) % KINDS.length];
    if (!next) return;
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid max-w-md grid-cols-2 gap-x-2.5 gap-y-4 pt-1 sm:grid-cols-4 lg:grid-cols-2"
    >
      {KINDS.map(({ value: kind, label: name, short, icon: Icon }) => {
        const active = kind === value;
        return (
          <div key={kind} className="flex flex-col items-center gap-2">
            <span aria-hidden className={cn('led', active && 'led-on')} />
            <button
              ref={(el) => {
                if (el) refs.current.set(kind, el);
                else refs.current.delete(kind);
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={name}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(kind)}
              className={cn(
                'key flex h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:h-[84px]',
                active ? 'key-primary bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:brightness-[0.97]',
              )}
            >
              <Icon className="size-[22px]" strokeWidth={1.4} />
              <span className="cap">{short}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
